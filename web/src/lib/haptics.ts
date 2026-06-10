import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

function webVibrate(ms: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
}

export const haptics = {
  light() {
    if (native) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    else webVibrate(8);
  },
  medium() {
    if (native) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    else webVibrate(14);
  },
  success() {
    if (native) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else webVibrate([10, 40, 18]);
  },
  warning() {
    if (native) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
    else webVibrate([14, 30, 14]);
  },
  select() {
    if (native) Haptics.selectionChanged().catch(() => {});
    else webVibrate(5);
  },
};
