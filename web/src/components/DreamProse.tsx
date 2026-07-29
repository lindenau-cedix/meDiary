import { Fragment, type ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * Lightweight renderer for the dream text (the AI-generated summary). The
 * content arrives as simple Markdown (headings `##`, lists `-`/`1.`,
 * **bold**, paragraphs). No Markdown dependency — we parse exactly the
 * shapes `system_prompt.md` produces and stay tolerant otherwise.
 *
 * `tone`:
 *   'surface' — reading surface on the regular app card (Dreams tab): best
 *               readability/AA contrast in light & dark.
 *   'night'   — on the night backdrop (startup dialog): soft off-white.
 *
 * The dream text is data — never translated.
 */
type Tone = 'surface' | 'night';

function renderInline(text: string, key: number): ReactNode {
  // **bold** → <strong>. Pairs `**` non-greedily and allows single `*` inside
  // (e.g. "**sleep *quality* good**"), without exposing raw markers.
  // Unbalanced/extra `**` stay as plain text in the surrounding segment —
  // there is never an orphaned lone `*` marker.
  const re = /\*\*([\s\S]+?)\*\*/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    nodes.push(
      <strong key={i++} className="font-semibold">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <Fragment key={key}>{nodes}</Fragment>;
}

export function DreamProse({ content, tone = 'surface', className }: { content: string; tone?: Tone; className?: string }) {
  const headingCls = tone === 'night' ? 'dream-ink' : 'text-ink';
  const bodyCls = tone === 'night' ? 'dream-ink-soft' : 'text-ink-muted';
  const accentCls = tone === 'night' ? 'dream-accent' : 'text-primary';

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      const text = para.join(' ').trim();
      if (text) {
        blocks.push(
          <p key={key++} className={cx('text-[15px] leading-relaxed', bodyCls)}>
            {renderInline(text, 0)}
          </p>,
        );
      }
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={key++} className={cx('space-y-1.5 pl-1', bodyCls)}>
          {list.map((li, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
              <span className={cx('mt-[7px] size-1.5 shrink-0 rounded-full', tone === 'night' ? 'bg-[rgb(var(--periwinkle))]' : 'bg-primary/60')} />
              <span className="flex-1">{renderInline(li, 0)}</span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // Horizontal rule (`---`, `***`, `___`) — ignore instead of showing as plain text.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      blocks.push(
        level <= 2 ? (
          <h3 key={key++} className={cx('font-display tracking-tight text-[17px] mt-1', headingCls)}>
            {renderInline(heading[2], 0)}
          </h3>
        ) : (
          <p key={key++} className={cx('text-[12px] font-semibold uppercase tracking-[0.14em] mt-1', accentCls)}>
            {renderInline(heading[2], 0)}
          </p>
        ),
      );
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      list.push(numbered[1]);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return <div className={cx('space-y-3', className)}>{blocks}</div>;
}
