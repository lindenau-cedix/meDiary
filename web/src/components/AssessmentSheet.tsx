import { useEffect, useRef, useState } from 'react';
import { Moon, Check } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Scale } from './ui/Scale';
import { Button } from './ui/Button';
import { TextArea } from './ui/inputs';
import { useToast } from './Toaster';
import { METRICS } from '../lib/metrics';
import { scoreColor } from '../lib/colors';
import { formatFull, relativeDays, dateNDaysAgo } from '../lib/format';
import { haptics } from '../lib/haptics';
import { useAssessment, useAssessments, useSaveAssessment } from '../lib/queries';

export function AssessmentSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const toast = useToast();
  const existing = useAssessment(date, open);
  const history = useAssessments(dateNDaysAgo(60), date);
  const save = useSaveAssessment();

  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [carried, setCarried] = useState(false);
  const initFor = useRef<string | null>(null);

  // Initialisieren, sobald das Sheet öffnet und Daten geladen sind
  useEffect(() => {
    if (!open) {
      initFor.current = null;
      return;
    }
    if (existing.isLoading) return;
    if (initFor.current === date) return;
    initFor.current = date;

    if (existing.data?.exists && existing.data.scores) {
      setScores({ ...existing.data.scores });
      setNote(existing.data.note ?? '');
      setCarried(false);
    } else {
      // Werte des letzten erfassten Tages übernehmen (nur Anpassen, was sich ändert)
      const prior = (history.data ?? []).filter((a) => a.date < date).at(-1);
      if (prior) {
        setScores({ ...prior.scores });
        setCarried(true);
      } else {
        setScores({});
        setCarried(false);
      }
      setNote('');
    }
  }, [open, date, existing.isLoading, existing.data, history.data]);

  const setMetric = (key: string, v: number) => setScores((s) => ({ ...s, [key]: v }));
  const filledCount = METRICS.filter((m) => scores[m.key] != null).length;

  const onSave = async () => {
    try {
      await save.mutateAsync({ date, scores, note: note.trim() || null });
      haptics.success();
      toast.show({ message: 'Tagesbild gespeichert', detail: `${filledCount}/${METRICS.length} Werte · ${relativeDays(date)}` });
      onClose();
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Speichern fehlgeschlagen', detail: (e as Error).message });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Moon size={20} className="text-accent" />
          Tagesbild
        </span>
      }
      subtitle={`${formatFull(date)}`}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-ink-muted">
            <span className="tabular font-semibold text-ink">{filledCount}</span>/{METRICS.length} erfasst
          </div>
          <Button variant="ghost" size="md" onClick={onClose}>
            Später
          </Button>
          <Button size="md" icon={<Check size={18} />} loading={save.isPending} onClick={onSave}>
            Speichern
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-muted leading-relaxed mb-1">
        Die Nachtmedikation ist erfasst. Wie war der heutige Tag? Skala 1–10.
      </p>
      {carried && (
        <p className="text-xs text-accent mb-4">
          Werte vom letzten Eintrag übernommen — passe nur an, was sich verändert hat.
        </p>
      )}

      <div className="space-y-5 pb-2">
        {METRICS.map((m) => {
          const v = scores[m.key] ?? null;
          return (
            <div key={m.key}>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="font-sans text-[15px] font-semibold text-ink">{m.label}</p>
                <span
                  className="font-display text-2xl leading-none tabular"
                  style={{ color: v ? scoreColor(v, m.polarity) : 'rgb(var(--text-faint))' }}
                >
                  {v ?? '–'}
                </span>
              </div>
              <Scale value={v} onChange={(val) => setMetric(m.key, val)} polarity={m.polarity} ariaLabel={m.label} />
              <div className="flex justify-between mt-1.5 px-0.5 text-[11px] text-ink-faint">
                <span>{m.lowLabel}</span>
                <span>{m.highLabel}</span>
              </div>
            </div>
          );
        })}

        <div className="pt-1">
          <TextArea
            placeholder="Notiz zum Tag (optional) — Auffälligkeiten, Auslöser, Kontext …"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
      </div>
    </Sheet>
  );
}
