import { Capacitor } from '@capacitor/core';

/** Native Initialisierung (nur in der APK aktiv). Auf Web ein No-Op. */
export async function initNative(resolvedTheme: 'light' | 'dark') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: resolvedTheme === 'dark' ? Style.Dark : Style.Light });
  } catch {
    /* status-bar plugin evtl. nicht vorhanden */
  }
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    /* keyboard plugin evtl. nicht vorhanden */
  }
}
