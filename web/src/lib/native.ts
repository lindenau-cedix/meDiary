import { Capacitor } from '@capacitor/core';

/** Native initialisation (only active in the APK). On the web: no-op. */
export async function initNative(resolvedTheme: 'light' | 'dark') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: resolvedTheme === 'dark' ? Style.Dark : Style.Light });
  } catch {
    /* status-bar plugin may not be present */
  }
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    /* keyboard plugin may not be present */
  }
}
