/**
 * Bridge to the JUCE plugin host (plugin/Source/PluginEditor.cpp). Inside the plugin the page runs
 * in a native web view that injects `window.__JUCE__`; in a normal browser `inPlugin` is false.
 * Protocol matches JUCE 8's frontend helper (modules/juce_gui_extra/native/javascript/index.js).
 */
interface JuceBackend {
  emitEvent(eventId: string, payload: unknown): void;
  addEventListener(eventId: string, fn: (payload: { promiseId: number; result: unknown }) => void): unknown;
}
const juce = (window as unknown as { __JUCE__?: { backend: JuceBackend } }).__JUCE__;

export const inPlugin = !!juce;

let nextId = 0;
const pending = new Map<number, (v: unknown) => void>();
juce?.backend.addEventListener('__juce__complete', ({ promiseId, result }) => {
  pending.get(promiseId)?.(result);
  pending.delete(promiseId);
});

export function callNative<T>(name: string, ...params: unknown[]): Promise<T> {
  if (!juce) return Promise.reject(new Error('not running inside the plugin'));
  const resultId = nextId++;
  return new Promise<T>((resolve) => {
    pending.set(resultId, resolve as (v: unknown) => void);
    juce.backend.emitEvent('__juce__invoke', { name, params, resultId });
  });
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** In the plugin: mirror engine log lines to the native diagnostics log (AMARI_LOG=1). */
export function mirrorLogToNative(subscribe: (cb: (line: string) => void) => void) {
  if (!inPlugin) return;
  subscribe((line) => void callNative('log', line).catch(() => {}));
  void callNative('log', `ui loaded · ${navigator.userAgent}`);
}
