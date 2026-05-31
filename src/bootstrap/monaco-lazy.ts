import type * as Monaco from "monaco-editor";

// Cached promise so repeated view-toggles never re-import the module.
let monacoPromise: Promise<typeof Monaco> | null = null;

/**
 * Dynamically import Monaco and its editor worker on first call, then return
 * the cached promise on every subsequent call. `self.MonacoEnvironment` is
 * configured here — before the Monaco module resolves — so that the worker
 * factory is in place when Monaco's internal bootstrapper first reads it.
 */
export function loadMonaco(): Promise<typeof Monaco> {
  if (monacoPromise) return monacoPromise;

  // Wrap the import in a .catch that clears the cache on failure — without
  // this, a transient network error on first open (offline, slow PWA SW
  // install, blocked CDN) would poison the cache: every subsequent call
  // would return the same rejected promise and the user would be stuck
  // until they reloaded the page. Clearing on rejection means the next
  // call retries cleanly.
  monacoPromise = (async () => {
    const [{ default: EditorWorker }, monaco] = await Promise.all([
      import("monaco-editor/esm/vs/editor/editor.worker?worker"),
      import("monaco-editor"),
    ]);

    self.MonacoEnvironment = {
      getWorker(_id: string, _label: string): Worker {
        return new EditorWorker();
      },
    };

    return monaco;
  })().catch((err: unknown) => {
    monacoPromise = null;
    throw err;
  });

  return monacoPromise;
}
