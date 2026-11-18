type Flusher = () => Promise<void>;

const flushers = new Set<Flusher>();

/**
 * Registers an active view's pending-edit flusher (e.g. debounced score writes)
 * so global events such as PWA reload updates can flush unsaved edits safely first.
 */
export function registerPendingSaveFlusher(fn: Flusher): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

export async function flushAllPendingSaves(): Promise<void> {
  await Promise.all(Array.from(flushers).map((fn) => fn().catch(() => {})));
}
