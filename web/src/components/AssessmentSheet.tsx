import { useEffect, useRef, useState } from 'react';
import { Moon, Check } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Scale } from './ui/Scale';
import { Button } from './ui/Button';
import { TextArea } from './ui/inputs';
import { useToast } from './Toaster';
import { metricList } from '../lib/metrics';
import { scoreColor } from '../lib/colors';
import { formatFull, relativeDays, dateNDaysAgo } from '../lib/format';
import { haptics } from '../lib/haptics';
import { useAssessment, useAssessments, useSaveAssessment } from '../lib/queries';
import { consumptionToday } from '../lib/time';
import { useT } from '../lib/i18n';

export function AssessmentSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const t = useT();
  const toast = useToast();
  const existing = useAssessment(date, open);
  const history = useAssessments(dateNDaysAgo(60), date);
  const save = useSaveAssessment();
  // `date` is the consumption day (the 03:30 boundary). We surface that
  // explicitly in the subtitle — especially when it differs from the
  // current wall-clock day (e.g. a backdated log at 02:30 that belongs to
  // the previous day) or when the sheet was opened retroactively from the
  // "Trends" tab (any consumption day).
  const today = consumptionToday();
  const isToday = date === today;
  const relative = isToday ? t('date.today') : relativeDays(date);
  const subtitle = t('components.assessmentSheet.subtitle', { date: formatFull(date), when: relative });

  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [carried, setCarried] = useState(false);
  const initFor = useRef<string | null>(null);

  // Initialise once the sheet opens and the data has loaded.
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
      // Carry forward the most recent logged day's values (only adjust what changed).
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

  const metrics = metricList();
  const setMetric = (key: string, v: number) => setScores((s) => ({ ...s, [key]: v }));
  const filledCount = metrics.filter((m) => scores[m.key] != null).length;

  const onSave = async () => {
    try {
      await save.mutateAsync({ date, scores, note: note.trim() || null });
      haptics.success();
      toast.show({
        message: t('components.assessmentSheet.savedToast'),
        detail: t('components.assessmentSheet.savedDetail', {
          date: formatFull(date),
          filled: filledCount,
          total: metrics.length,
        }),
      });
      onClose();
    } catch (e) {
      haptics.warning();
      toast.show({
        tone: 'warning',
        message: t('components.assessmentSheet.failedToast'),
        detail: (e as Error).message,
      });
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
          {t('components.assessmentSheet.title')}
        </span>
      }
      subtitle={subtitle}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-ink-muted">
            <span className="tabular font-semibold text-ink">{filledCount}</span>/{metrics.length}
            <span className="ml-1.5">{t('components.assessmentSheet.counterLabel')}</span>
          </div>
          <Button variant="ghost" size="md" onClick={onClose}>
            {t('components.assessmentSheet.later')}
          </Button>
          <Button size="md" icon={<Check size={18} />} loading={save.isPending} onClick={onSave}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-muted leading-relaxed mb-1">
        {isToday
          ? t('components.assessmentSheet.promptToday')
          : date < today
            ? t('components.assessmentSheet.promptPast', { when: relative })
            : t('components.assessmentSheet.promptFuture')}
      </p>
      {carried && (
        <p className="text-xs text-accent mb-4">{t('components.assessmentSheet.carriedHint')}</p>
      )}

      <div className="space-y-5 pb-2">
        {metrics.map((m) => {
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
            placeholder={t('components.assessmentSheet.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
      </div>
    </Sheet>
  );
}
