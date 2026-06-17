import type { Config } from 'tailwindcss';

/** Farbe aus CSS-Variable (RGB-Kanäle) mit Tailwind-Opacity-Support. */
const c = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c('--bg'),
        surface: c('--surface'),
        surface2: c('--surface-2'),
        line: c('--border'),
        hairline: c('--hairline'),
        ink: {
          DEFAULT: c('--text'),
          muted: c('--text-muted'),
          faint: c('--text-faint'),
        },
        primary: {
          DEFAULT: c('--primary'),
          fg: c('--primary-fg'),
          soft: c('--primary-soft'),
        },
        accent: {
          DEFAULT: c('--accent'),
          fg: c('--accent-fg'),
          soft: c('--accent-soft'),
        },
        good: c('--good'),
        bad: c('--bad'),
        warn: c('--warn'),
        // Gedämpfte, überlegte Diff-Farben für die Daten-Konsole — bewusst KEIN
        // grell-grün/-rot, sondern an die warme „Apotheken"-Palette angelehnt.
        'diff-add': c('--diff-add'),
        'diff-add-soft': c('--diff-add-soft'),
        'diff-del': c('--diff-del'),
        'diff-del-soft': c('--diff-del-soft'),
        'diff-mod': c('--diff-mod'),
        'diff-mod-soft': c('--diff-mod-soft'),
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        raised: 'var(--shadow-raised)',
        float: 'var(--shadow-float)',
      },
      maxWidth: {
        app: '34rem', // angenehme Lesebreite, zentriert auf großen Screens
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s var(--ease, cubic-bezier(0.22,1,0.36,1)) both',
        pop: 'pop 0.35s var(--ease, cubic-bezier(0.22,1,0.36,1)) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
