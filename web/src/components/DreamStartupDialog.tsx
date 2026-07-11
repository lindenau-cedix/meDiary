import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Moon, X } from 'lucide-react';
import { Starfield } from './Starfield';
import { DreamProse } from './DreamProse';
import { useLatestDream } from '../lib/queries';
import { formatFull } from '../lib/format';
import { haptics } from '../lib/haptics';
import { consumptionToday } from '../lib/time';

/**
 * Startup-Dialog: zeigt beim App-/Session-Start EINMAL den jüngsten Traum in
 * einer träumerisch gestalteten Karte (Nacht-Verlauf, Mondschein-Halo,
 * Sternchen), während die App dahinter weichgezeichnet und abgedunkelt wird.
 *
 * Verhalten:
 *  - genau einmal pro Konsum-Tag (Tagesgrenze 03:30 Europe/Berlin, identisch
 *    zur Server-Seite via `consumptionToday()`). Wird die App nach 03:30
 *    erneut geöffnet, erscheint der Dialog wieder.
 *  - nur, wenn überhaupt ein Traum existiert (sonst: nichts),
 *  - schließbar per Scrim-Klick, „✕"/„Schließen", Escape ODER Primäraktion
 *    „Im Traum-Tab öffnen" (navigiert in den Traum-Tab),
 *  - a11y: aria-modal, Fokus-Falle, Escape, Fokus-Rückgabe,
 *  - prefers-reduced-motion: nur kurzes Fade, kein Drift/Scale/Atmen.
 *
 * Persistierung: sessionStorage[`mediary.lastDreamDialogDate`] = der
 * Konsum-Tag, an dem der Dialog zuletzt gezeigt wurde. Beim Mount wird
 * der aktuelle Konsum-Tag mit dem gespeicherten verglichen — nur bei
 * Ungleichheit (oder leerem Wert) erscheint der Dialog. Das übersteht
 * Tab-Restarts am selben Tag (kein erneuter Dialog) und triggert nach
 * dem 03:30-Rollover korrekt wieder.
 */

const SESSION_KEY = 'mediary.lastDreamDialogDate';

export function DreamStartupDialog() {
  const { data, isLoading } = useLatestDream();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Entscheidung „zeigen?" — nur einmal pro Konsum-Tag (03:30-Grenze),
  // nur wenn ein Traum da ist.
  useEffect(() => {
    if (isLoading || !data) return;
    if (!data.exists || !data.content) return;
    const today = consumptionToday();
    const lastShown = sessionStorage.getItem(SESSION_KEY);
    if (lastShown === today) return;
    sessionStorage.setItem(SESSION_KEY, today);
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, [isLoading, data]);

  const close = useCallback(() => {
    setOpen(false);
    // Fokus an das vorher fokussierte Element zurückgeben.
    const el = previouslyFocused.current;
    if (el && typeof el.focus === 'function') {
      // nach dem Exit-Frame, damit der Portal-Inhalt nicht mehr im Weg ist
      window.setTimeout(() => el.focus(), 0);
    }
  }, []);

  const openTab = useCallback(() => {
    haptics.select();
    close();
    navigate('/tagebuch?view=traum');
  }, [close, navigate]);

  // Body-Scroll sperren + Escape + Fokus-Falle, solange offen.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Anfangsfokus in die Karte.
    const focusTimer = window.setTimeout(() => cardRef.current?.focus(), 60);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') {
        const root = cardRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === root)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open, close]);

  const dream = data && data.exists ? data : null;

  return createPortal(
    <AnimatePresence>
      {open && dream && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Scrim: Blur + dunkler Schleier (Fallback: solides Overlay). */}
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.2 : 0.6, ease: 'easeOut' }}
            onClick={close}
          />

          {/* Traum-Karte */}
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Traum vom ${dream.date ? formatFull(dream.date) : ''}`}
            tabIndex={-1}
            className="relative w-full max-w-[33rem] outline-none"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: reduce ? 0.2 : 0.8, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.12 }}
          >
            <div className="dream-breathe">
              <div className="relative overflow-hidden rounded-[28px] dream-night dream-grain shadow-float ring-1 ring-[rgb(var(--periwinkle))]/20">
                {/* Mondschein-Halo (weiches radiales Leuchten, pulsiert) */}
                <div
                  className="dream-halo pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-72 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgb(var(--moon-halo) / 0.30), transparent 70%)' }}
                  aria-hidden
                />
                <Starfield count={14} className="opacity-90" />

                {/* Kopf */}
                <div className="relative px-6 pt-6 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[12px] font-medium dream-accent uppercase tracking-[0.14em]">
                        <Moon size={13} /> Heute Nacht geträumt
                      </p>
                      <h2 className="font-display text-[26px] leading-tight dream-ink mt-1.5">
                        {dream.date ? formatFull(dream.date) : 'Traum'}
                      </h2>
                    </div>
                    <button
                      onClick={close}
                      aria-label="Schließen"
                      className="press grid place-items-center size-9 shrink-0 rounded-full bg-white/5 dream-ink-soft hover:bg-white/10 hover:dream-ink transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Inhalt: scrollbar, obere/untere Kante weich ausgeblendet */}
                <div
                  className="relative px-6 max-h-[52vh] overflow-y-auto overscroll-contain no-scrollbar"
                  style={{
                    maskImage: 'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 20px), transparent)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 20px), transparent)',
                  }}
                >
                  <div className="py-2">
                    <DreamProse content={dream.content ?? ''} tone="night" />
                  </div>
                </div>

                {/* Aktionen — bewusst native Buttons (nicht <Button>): so gibt es
                    keine Tailwind-Klassen-Kollision (cx ohne twMerge) und der
                    Fokusring-Offset sitzt auf der Nacht-Fläche statt auf --bg.
                    Salbei bleibt der primäre interaktive Akzent. */}
                <div className="relative flex items-center gap-2.5 px-6 pt-4 pb-6">
                  <button
                    onClick={openTab}
                    className="press flex-1 inline-flex items-center justify-center gap-2 h-12 px-5 rounded-2xl text-[15px] font-medium bg-primary text-primary-fg shadow-soft transition-[filter] hover:brightness-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--night-mid))]"
                  >
                    <Moon size={17} /> Im Traum-Tab öffnen
                  </button>
                  <button
                    onClick={close}
                    className="press inline-flex items-center justify-center h-12 px-5 rounded-2xl text-[15px] font-medium text-[rgb(var(--star))]/75 transition-colors hover:text-[rgb(var(--star))] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--periwinkle))]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--night-mid))]"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
