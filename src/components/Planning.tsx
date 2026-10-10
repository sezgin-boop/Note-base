import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cardLabel } from '../share/outline';
import { isPhone, useStore } from '../store';
import { parseTags } from '../tags';
import type { BoardMeta, CardNode } from '../types';
import { PLATFORMS, STATUS_COLORS } from '../types';
import { Modal } from './Dialogs';
import { useAllCards } from './Panels';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Card details: schedule + tags ----------

export function DetailsDialog() {
  const { detailsId, nodes, updateData, setPanel } = useStore();
  const node = nodes.find((n) => n.id === detailsId);
  const [tagText, setTagText] = useState(() => (node?.data.tags ?? []).join(', '));
  if (!node) return null;
  const d = node.data;
  return (
    <Modal title={`Schedule & tags · ${cardLabel(node)}`} onClose={() => setPanel(null)}>
      <div className="stack">
        <div className="form-row">
          <label>
            <span>Publish date</span>
            <input
              className="field-input"
              type="date"
              value={d.publishDate ?? ''}
              onChange={(e) => updateData(node.id, { publishDate: e.target.value || undefined })}
            />
          </label>
          <label>
            <span>Platform</span>
            <select
              className="field-input"
              value={d.platform ?? ''}
              onChange={(e) => updateData(node.id, { platform: e.target.value || undefined })}
            >
              <option value="">—</option>
              {Object.keys(PLATFORMS).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-col">
          <span>Tags</span>
          <input
            className="field-input"
            placeholder="hook, broll, client-a"
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value);
              updateData(node.id, { tags: parseTags(e.target.value) });
            }}
          />
          <small className="muted">You can also just type #hashtags inside a note — they count as tags.</small>
        </label>
        <div className="row">
          {(d.publishDate || d.platform) && (
            <button className="btn-ghost" onClick={() => updateData(node.id, { publishDate: undefined, platform: undefined })}>
              Remove from calendar
            </button>
          )}
          <button className="btn" onClick={() => setPanel(null)}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Content calendar ----------

interface Entry {
  date: string;
  kind: 'post' | 'due';
  title: string;
  color: string;
  label: string;
  board: BoardMeta;
  node: CardNode;
}

export function CalendarView() {
  const { setPanel, focusCard, patchCard } = useStore();
  const all = useAllCards();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [mode, setMode] = useState<'month' | 'list'>(() => (isPhone() ? 'list' : 'month'));
  const [dragging, setDragging] = useState<Entry | null>(null);
  const today = iso(new Date());

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const { board, node } of all) {
      const d = node.data;
      if (d.publishDate)
        out.push({
          date: d.publishDate,
          kind: 'post',
          title: cardLabel(node, (id) => all.find((x) => x.board.id === id)?.board.name),
          color: PLATFORMS[d.platform ?? ''] ?? '#a1a1aa',
          label: d.platform ?? 'Post',
          board,
          node,
        });
      if (node.type === 'project' && d.deadline && d.status !== 'paid')
        out.push({
          date: d.deadline,
          kind: 'due',
          title: d.title || 'Job',
          color: STATUS_COLORS[d.status ?? 'brief'],
          label: 'Due',
          board,
          node,
        });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [all]);

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) (m.get(e.date) ?? m.set(e.date, []).get(e.date)!).push(e);
    return m;
  }, [entries]);

  // Weeks start on Monday.
  const first = new Date(cursor);
  first.setDate(1 - ((cursor.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const monthName = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  const open = (e: Entry) => {
    setPanel(null);
    focusCard(e.board.id, e.node.id);
  };
  const drop = (date: string) => {
    if (!dragging) return;
    patchCard(dragging.board.id, dragging.node.id, dragging.kind === 'post' ? { publishDate: date } : { deadline: date });
    setDragging(null);
  };

  const chip = (e: Entry) => (
    <button
      key={`${e.kind}-${e.node.id}`}
      className={`cal-entry ${e.kind}`}
      style={{ '--c': e.color } as React.CSSProperties}
      draggable
      onDragStart={() => setDragging(e)}
      onClick={() => open(e)}
      title={`${e.title} — ${e.board.name}`}
    >
      <span className="cal-label">{e.label}</span> {e.title}
    </button>
  );

  const upcoming = entries.filter((e) => e.date >= today);

  return (
    <div className="calendar">
      <div className="cal-head">
        <b className="cal-title">Content calendar</b>
        <div className="seg">
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
            Month
          </button>
          <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>
            Upcoming
          </button>
        </div>
        {mode === 'month' && (
          <div className="cal-nav">
            <button className="icon-btn" onClick={() => move(-1)}>
              <ChevronLeft size={16} />
            </button>
            <span>{monthName}</span>
            <button className="icon-btn" onClick={() => move(1)}>
              <ChevronRight size={16} />
            </button>
            <button
              className="btn-ghost small-btn"
              onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            >
              Today
            </button>
          </div>
        )}
        <button className="icon-btn cal-close" onClick={() => setPanel(null)}>
          <X size={16} />
        </button>
      </div>

      {mode === 'month' ? (
        <div className="cal-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = iso(d);
            const list = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={`cal-day ${d.getMonth() !== cursor.getMonth() ? 'other' : ''} ${key === today ? 'today' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(key)}
              >
                <span className="cal-num">{d.getDate()}</span>
                {list.slice(0, 4).map(chip)}
                {list.length > 4 && <span className="muted small">+{list.length - 4} more</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cal-list">
          {upcoming.length ? (
            upcoming.map((e, i) => (
              <div key={`${e.kind}-${e.node.id}`} className="cal-list-row">
                {(i === 0 || upcoming[i - 1].date !== e.date) && (
                  <div className="cal-list-date">
                    {new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {e.date === today && <span className="badge">Today</span>}
                  </div>
                )}
                {chip(e)}
                <span className="muted small">
                  {e.board.icon} {e.board.name}
                </span>
              </div>
            ))
          ) : (
            <div className="muted empty">Nothing scheduled yet.</div>
          )}
        </div>
      )}
      <p className="muted small cal-hint">
        Right-click a card (or tap ⋯ on a selected card) → <b>Schedule & tags…</b> to put it on the calendar. Job deadlines show
        up automatically. Drag entries to another day to reschedule.
      </p>
    </div>
  );
}
