import { registerPlugin } from '@capacitor/core';

/**
 * Bridge zum nativen Android-Plugin `app.mediary.bridge.WidgetBridgePlugin`.
 *
 * Wird vom WebView nach jedem `getApiBase()`/`setApiBase()`-Aufruf
 * angefunkt, damit die Homescreen-Widgets (SampleWidgetProvider) die
 * aktuelle API-URL in den SharedPreferences vorfinden — sonst könnten
 * sie erst nach einem App-Start senden.
 *
 * Im Browser (kein Capacitor) ist `Capacitor.Plugins.WidgetBridge`
 * nicht definiert; die Methoden no-op'en still, sodass `npm run dev`
 * ohne Android-Emulator funktioniert.
 */
export interface WidgetBridgePlugin {
  setApiBase(options: { url: string }): Promise<void>;
}

const native = registerPlugin<WidgetBridgePlugin>('WidgetBridge', {
  // Kein Web-Fallback nötig — die Aufrufe sind fire-and-forget.
});

/**
 * Spiegelt die API-URL in den nativen Speicher. Idempotent; im
 * Browser-Betrieb ein No-Op (Fehler werden verschluckt, damit
 * unkritische `console.warn` nicht den UI-Flow stören).
 */
export async function mirrorApiBaseToWidgets(url: string): Promise<void> {
  if (!url) return;
  try {
    // Capacitor-Plugins sind auf nativen Plattformen verfügbar;
    // im Web-Fall wirft `native.setApiBase` — wir fangen das.
    await native?.setApiBase({ url });
  } catch {
    // Web/no-Capacitor: still ignorieren. Der Aufruf ist best-effort.
  }
}
