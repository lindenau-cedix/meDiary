import { registerPlugin } from '@capacitor/core';

/**
 * Bridge to the native Android plugin `app.mediary.bridge.WidgetBridgePlugin`.
 *
 * Called by the WebView after every `getApiBase()`/`setApiBase()` call so
 * the home-screen widgets (SampleWidgetProvider) find the current API URL
 * in SharedPreferences — otherwise they could only send after the app has
 * been started at least once.
 *
 * In the browser (no Capacitor) `Capacitor.Plugins.WidgetBridge` is not
 * defined; the methods silently no-op so `npm run dev` works without an
 * Android emulator.
 */
export interface WidgetBridgePlugin {
  setApiBase(options: { url: string }): Promise<void>;
}

const native = registerPlugin<WidgetBridgePlugin>('WidgetBridge', {
  // No web fallback needed — the calls are fire-and-forget.
});

/**
 * Mirror the API URL into native storage. Idempotent; in the browser this
 * is a no-op (errors are swallowed so uncritical `console.warn` does not
 * disturb the UI flow).
 */
export async function mirrorApiBaseToWidgets(url: string): Promise<void> {
  if (!url) return;
  try {
    // Capacitor plugins are available on native platforms; in the web
    // case `native.setApiBase` throws — we catch that.
    await native?.setApiBase({ url });
  } catch {
    // Web/no-Capacitor: silently ignore. The call is best-effort.
  }
}
