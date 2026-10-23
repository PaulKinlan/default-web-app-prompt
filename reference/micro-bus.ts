/**
 * reference/micro-bus.ts — Production Event & Command Micro-Bus (< 1 KiB)
 *
 * Provides decoupled, type-safe inter-component communication with zero client-side dependencies.
 * Supports lazy Web Component slice hydration, cross-tab BroadcastChannel synchronization,
 * native Invoker Commands (commandfor), and schema-validated sandboxed iframe bridges.
 */

export interface BusEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly source?: string;
  readonly timestamp: number;
}

export interface BusCommand<T = unknown> {
  readonly command: string;
  readonly payload: T;
  readonly source?: string;
  readonly timestamp: number;
}

export type EventHandler<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;
export type CommandHandler<T = unknown> = (cmd: BusCommand<T>) => void | Promise<void>;

export interface LazySliceConfig {
  readonly tagName: string;
  readonly loader: () => Promise<unknown>;
  readonly commands?: readonly string[];
  readonly events?: readonly string[];
  readonly slot?: string;
  readonly hydrateOnVisible?: boolean;
}

export interface SandboxBridgeConfig {
  readonly allowedCommands: readonly string[];
  readonly validatePayload?: (command: string, payload: unknown) => boolean;
}

export interface MicroBus {
  on<T = unknown>(type: string, handler: EventHandler<T>): () => void;
  emit<T = unknown>(type: string, payload: T, source?: string): void;
  onCommand<T = unknown>(command: string, handler: CommandHandler<T>): () => void;
  command<T = unknown>(command: string, payload: T, source?: string): void;
  registerLazySlice(sliceId: string, config: LazySliceConfig): void;
  createSandboxBridge(iframe: HTMLIFrameElement, config: SandboxBridgeConfig): MessagePort;
  destroy(): void;
}

export function createMicroBus(options: { channelName?: string; enableBroadcast?: boolean } = {}): MicroBus {
  const eventTarget = new EventTarget();
  const loadedSlices = new Set<string>();
  const sliceLoaders = new Map<string, LazySliceConfig>();

  const broadcast: BroadcastChannel | null =
    options.enableBroadcast && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(options.channelName ?? 'app-micro-bus')
      : null;

  if (broadcast) {
    broadcast.onmessage = (msg: MessageEvent) => {
      const data = msg.data;
      if (data && typeof data === 'object' && 'kind' in data) {
        if (data.kind === 'event') {
          eventTarget.dispatchEvent(new CustomEvent(`event:${data.type}`, { detail: data }));
        } else if (data.kind === 'command') {
          eventTarget.dispatchEvent(new CustomEvent(`cmd:${data.command}`, { detail: data }));
        }
      }
    };
  }

  // Native Invoker Commands bridge (command / commandfor)
  if (typeof document !== 'undefined') {
    document.addEventListener('command', ((e: Event) => {
      const target = e.target as HTMLElement;
      const cmd = (e as unknown as { command?: string }).command || target.getAttribute('command');
      if (cmd) {
        dispatchCommand(cmd, { sourceElement: target.id || target.tagName });
      }
    }) as EventListener);
  }

  async function loadSlice(sliceId: string, config: LazySliceConfig): Promise<void> {
    if (loadedSlices.has(sliceId)) return;
    loadedSlices.add(sliceId);
    try {
      await config.loader();
      // Mount into shell slot if designated and element is not yet in DOM
      if (config.slot && typeof document !== 'undefined') {
        const slotEl = document.querySelector(`[data-slot="${config.slot}"]`);
        if (slotEl && !slotEl.querySelector(config.tagName)) {
          const el = document.createElement(config.tagName);
          slotEl.appendChild(el);
        }
      }
    } catch (err) {
      loadedSlices.delete(sliceId);
      console.error(`[micro-bus] failed to hydrate slice '${sliceId}':`, err);
    }
  }

  function dispatchCommand<T>(cmdName: string, payload: T, source?: string): void {
    const cmd: BusCommand<T> = {
      command: cmdName,
      payload,
      source,
      timestamp: Date.now(),
    };

    // Hydrate any lazy slice listening for this command
    for (const [id, config] of sliceLoaders.entries()) {
      if (config.commands?.includes(cmdName)) {
        void loadSlice(id, config);
      }
    }

    eventTarget.dispatchEvent(new CustomEvent(`cmd:${cmdName}`, { detail: cmd }));

    if (broadcast) {
      try {
        broadcast.postMessage({ kind: 'command', ...cmd });
      } catch {
        // Fallback if payload is non-clonable
      }
    }
  }

  return {
    on<T = unknown>(type: string, handler: EventHandler<T>): () => void {
      const listener = (e: Event) => {
        void handler((e as CustomEvent<BusEvent<T>>).detail);
      };
      eventTarget.addEventListener(`event:${type}`, listener);
      return () => eventTarget.removeEventListener(`event:${type}`, listener);
    },

    emit<T = unknown>(type: string, payload: T, source?: string): void {
      const ev: BusEvent<T> = {
        type,
        payload,
        source,
        timestamp: Date.now(),
      };

      // Hydrate any lazy slice listening for this event
      for (const [id, config] of sliceLoaders.entries()) {
        if (config.events?.includes(type)) {
          void loadSlice(id, config);
        }
      }

      eventTarget.dispatchEvent(new CustomEvent(`event:${type}`, { detail: ev }));

      if (broadcast) {
        try {
          broadcast.postMessage({ kind: 'event', ...ev });
        } catch {
          // Fallback if payload is non-clonable
        }
      }
    },

    onCommand<T = unknown>(cmdName: string, handler: CommandHandler<T>): () => void {
      const listener = (e: Event) => {
        void handler((e as CustomEvent<BusCommand<T>>).detail);
      };
      eventTarget.addEventListener(`cmd:${cmdName}`, listener);
      return () => eventTarget.removeEventListener(`cmd:${cmdName}`, listener);
    },

    command<T = unknown>(cmdName: string, payload: T, source?: string): void {
      dispatchCommand(cmdName, payload, source);
    },

    registerLazySlice(sliceId: string, config: LazySliceConfig): void {
      sliceLoaders.set(sliceId, config);

      if (config.hydrateOnVisible && typeof IntersectionObserver !== 'undefined' && config.slot && typeof document !== 'undefined') {
        const slotEl = document.querySelector(`[data-slot="${config.slot}"]`);
        if (slotEl) {
          const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer.disconnect();
              void loadSlice(sliceId, config);
            }
          });
          observer.observe(slotEl);
        }
      }
    },

    createSandboxBridge(iframe: HTMLIFrameElement, config: SandboxBridgeConfig): MessagePort {
      const channel = new MessageChannel();
      const port1 = channel.port1;
      const port2 = channel.port2;

      port1.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        const { command: cmdName, payload } = msg as { command?: unknown; payload?: unknown };
        if (typeof cmdName !== 'string') return;

        if (!config.allowedCommands.includes(cmdName)) {
          console.warn(`[sandbox-bridge] command '${cmdName}' rejected: not in allowed list.`);
          return;
        }

        if (config.validatePayload && !config.validatePayload(cmdName, payload)) {
          console.warn(`[sandbox-bridge] command '${cmdName}' payload rejected schema validation.`);
          return;
        }

        dispatchCommand(cmdName, payload, 'sandbox-iframe');
      };

      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'init-sandbox-bridge' }, '*', [port2]);
      } else {
        iframe.addEventListener('load', () => {
          iframe.contentWindow?.postMessage({ type: 'init-sandbox-bridge' }, '*', [port2]);
        }, { once: true });
      }

      return port1;
    },

    destroy(): void {
      broadcast?.close();
    },
  };
}
