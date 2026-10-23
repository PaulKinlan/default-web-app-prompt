/**
 * reference/sw-updater.ts — Client-Side Service Worker Lifecycle & Version Update Manager
 *
 * Implements:
 * 1. Dual-signal update detection: Native SW waiting state + /health commit drift.
 * 2. Micro-bus notification ('sw:update-available') and accessible reload prompt banner.
 * 3. State-preserving reload: Checkpoints form inputs and scroll position to sessionStorage.
 * 4. Controlled activation: Sends 'SKIP_WAITING' and reloads on 'controllerchange'.
 * 5. Emergency kill-switch: Detects /health killSw flag, unregisters SW, and purges caches.
 */

export interface FormCheckpointEntry {
  readonly selector: string;
  readonly value?: string;
  readonly checked?: boolean;
}

export interface CheckpointData {
  readonly timestamp: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly inputs: readonly FormCheckpointEntry[];
}

export const CHECKPOINT_STORAGE_KEY = "__sw_reload_checkpoint__";

/**
 * Checkpoint non-sensitive form fields and scroll coordinates before reloading for an update.
 * Explicitly skips password fields, hidden tokens, and elements marked [data-sensitive].
 */
export function checkpointClientStateToSessionStorage(
  storage: Storage | any = typeof window !== "undefined" ? window.sessionStorage : null,
  doc: Document | any = typeof document !== "undefined" ? document : null,
  win: Window | any = typeof window !== "undefined" ? window : null
): CheckpointData | null {
  if (!storage || !doc) return null;

  try {
    const inputs: FormCheckpointEntry[] = [];
    const elements = doc.querySelectorAll(
      'input:not([type="password"]):not([type="hidden"]):not([data-sensitive]), textarea:not([data-sensitive]), select:not([data-sensitive])'
    );

    let idx = 0;
    for (const el of elements) {
      idx++;
      const selector = el.id
        ? `#${el.id}`
        : el.name
        ? `[name="${el.name}"]`
        : `[data-form-idx="${idx}"]`;

      if (el.type === "checkbox" || el.type === "radio") {
        inputs.push({ selector, checked: Boolean(el.checked) });
      } else {
        inputs.push({ selector, value: String(el.value || "") });
      }
    }

    const data: CheckpointData = {
      timestamp: Date.now(),
      scrollX: win?.scrollX || 0,
      scrollY: win?.scrollY || 0,
      inputs,
    };

    storage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch (err) {
    console.warn("[sw-updater] Failed to checkpoint state:", err);
    return null;
  }
}

/**
 * Restores form fields and scroll coordinates preserved before an update reload.
 */
export function restoreClientStateFromSessionStorage(
  storage: Storage | any = typeof window !== "undefined" ? window.sessionStorage : null,
  doc: Document | any = typeof document !== "undefined" ? document : null,
  win: Window | any = typeof window !== "undefined" ? window : null
): boolean {
  if (!storage || !doc) return false;

  try {
    const raw = storage.getItem(CHECKPOINT_STORAGE_KEY);
    if (!raw) return false;

    storage.removeItem(CHECKPOINT_STORAGE_KEY);
    const data: CheckpointData = JSON.parse(raw);

    // Reject checkpoints older than 10 minutes
    if (Date.now() - data.timestamp > 10 * 60 * 1000) return false;

    for (const entry of data.inputs) {
      try {
        const el = doc.querySelector(entry.selector);
        if (!el) continue;
        if (entry.checked !== undefined && (el.type === "checkbox" || el.type === "radio")) {
          el.checked = entry.checked;
        } else if (entry.value !== undefined) {
          el.value = entry.value;
        }
      } catch {}
    }

    if (win && typeof win.scrollTo === "function" && (data.scrollX || data.scrollY)) {
      win.scrollTo(data.scrollX, data.scrollY);
    }

    return true;
  } catch (err) {
    console.warn("[sw-updater] Failed to restore checkpointed state:", err);
    return false;
  }
}

export interface SwUpdateManagerOptions {
  readonly currentCommit: string;
  readonly swScriptUrl?: string;
  readonly healthUrl?: string;
  readonly bus?: any;
  readonly onUpdateAvailable?: (detail: { currentCommit: string; newCommit?: string; source: string }) => void;
  readonly bannerSelector?: string;
  readonly checkIntervalMs?: number;
}

/**
 * Initializes Service Worker update coordination with dual-signal detection.
 */
export function createSwUpdateManager(options: SwUpdateManagerOptions) {
  const {
    currentCommit,
    swScriptUrl = "/sw.js",
    healthUrl = "/health",
    bus,
    onUpdateAvailable,
    bannerSelector = '[data-slot="sw-update-banner"]',
    checkIntervalMs = 60 * 60 * 1000, // 1 hour
  } = options;

  let registration: any = null;
  let waitingWorker: any = null;
  let updateAnnounced = false;

  function notifyUpdate(newCommit?: string, source = "sw-waiting") {
    if (updateAnnounced) return;
    updateAnnounced = true;

    const detail = { currentCommit, newCommit, source };

    if (bus && typeof bus.emit === "function") {
      bus.emit("sw:update-available", detail);
    }
    if (typeof onUpdateAvailable === "function") {
      onUpdateAvailable(detail);
    }

    // Reveal UI update banner if available in the DOM
    if (typeof document !== "undefined") {
      const banner = document.querySelector(bannerSelector);
      if (banner) {
        banner.removeAttribute("hidden");
        banner.innerHTML = `
          <div class="sw-update-alert" role="status" aria-live="polite">
            <span>A new version of the app is available.</span>
            <button type="button" data-action="sw-reload" class="btn btn-sm">Reload now</button>
            <button type="button" data-action="sw-dismiss" class="btn btn-ghost btn-sm">Later</button>
          </div>
        `;
        banner.querySelector('[data-action="sw-reload"]')?.addEventListener("click", () => applyUpdate());
        banner.querySelector('[data-action="sw-dismiss"]')?.addEventListener("click", () => {
          banner.setAttribute("hidden", "");
        });
      }
    }
  }

  /** Check /health endpoint for commit drift or emergency kill-switch */
  async function checkHealthDrift(): Promise<void> {
    try {
      const res = await fetch(healthUrl, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      // Check emergency kill-switch
      if (data?.killSw === true) {
        await executeKillSwitch();
        return;
      }

      // Check commit drift
      const remoteCommit = data?.version?.commit;
      if (remoteCommit && remoteCommit !== currentCommit) {
        notifyUpdate(remoteCommit, "health-commit");
      }
    } catch {}
  }

  /** Apply update: Checkpoint state, send SKIP_WAITING, wait for controllerchange, reload */
  async function applyUpdate(): Promise<void> {
    checkpointClientStateToSessionStorage();

    if (waitingWorker) {
      let reloaded = false;
      const onControllerChange = () => {
        if (!reloaded) {
          reloaded = true;
          if (typeof window !== "undefined") window.location.reload();
        }
      };

      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
      }

      waitingWorker.postMessage({ type: "SKIP_WAITING" });

      // Fallback timeout in case controllerchange does not fire
      setTimeout(() => {
        if (!reloaded && typeof window !== "undefined") {
          window.location.reload();
        }
      }, 1500);
    } else {
      // Direct reload if no waiting worker
      if (typeof window !== "undefined") window.location.reload();
    }
  }

  /** Execute emergency kill-switch: unregister SW and purge caches */
  async function executeKillSwitch(): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (bus && typeof bus.emit === "function") {
      bus.emit("sw:killed", { timestamp: Date.now() });
    }
  }

  /** Initialize registration and event hooks */
  async function init(): Promise<void> {
    // Restore any checkpointed state from previous reload
    restoreClientStateFromSessionStorage();

    if (bus && typeof bus.onCommand === "function") {
      bus.onCommand("sw:apply-update", () => applyUpdate());
      bus.onCommand("sw:check-update", () => {
        if (registration) registration.update();
        checkHealthDrift();
      });
      bus.onCommand("sw:kill", () => executeKillSwitch());
    }

    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return;
    }

    try {
      registration = await navigator.serviceWorker.register(swScriptUrl, { scope: "/" });

      // If a waiting worker already exists on initial page load
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        notifyUpdate(undefined, "sw-waiting");
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = newWorker;
            notifyUpdate(undefined, "sw-waiting");
          }
        });
      });

      // Check on visibility change (user re-opens/focuses tab)
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            registration.update();
            checkHealthDrift();
          }
        });
      }

      // Check periodically
      if (typeof setInterval !== "undefined") {
        setInterval(() => {
          registration.update();
          checkHealthDrift();
        }, checkIntervalMs);
      }

      // Initial health drift check
      checkHealthDrift();
    } catch (err) {
      console.warn("[sw-updater] Service worker registration failed:", err);
    }
  }

  return {
    init,
    applyUpdate,
    executeKillSwitch,
    checkHealthDrift,
    getRegistration: () => registration,
    getWaitingWorker: () => waitingWorker,
  };
}
