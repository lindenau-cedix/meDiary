import type { MetricPolarity } from './types';

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Anchors: rust red → amber → sage green (warm, brand-faithful)
const BAD: RGB = [194, 92, 68];
const WARN: RGB = [210, 154, 74];
const GOOD: RGB = [110, 146, 112];

/** 0 = unfavourable … 1 = favourable, taking polarity into account. */
export function goodness(value: number, polarity: MetricPolarity): number {
  const t = (Math.min(10, Math.max(1, value)) - 1) / 9;
  return polarity === 'positive' ? t : 1 - t;
}

/** Colour for a 1–10 scale value (green = good, rust = bad). */
export function scoreColor(value: number, polarity: MetricPolarity): string {
  const g = goodness(value, polarity);
  const rgb = g < 0.5 ? lerpColor(BAD, WARN, g / 0.5) : lerpColor(WARN, GOOD, (g - 0.5) / 0.5);
  return rgbToHex(rgb);
}

export { hexToRgb };
