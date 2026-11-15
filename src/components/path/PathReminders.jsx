import { useEffect, useRef, useState } from 'react';
import {
  REMINDER_MAX_LENGTH,
  createReminder,
  isCarriedReminder,
  isOpenReminder,
  reminderEditText,
  renameReminder,
} from '../../lib/path/dayReminders';
import { hideDragImage } from './PathDropGhost';

const PLACEHOLDER = 'Υπενθύμιση · π.χ. 10:30 Κάρμεν';

function shortDay(isoDate) {
  return `${Number(isoDate.slice(8))}/${Number(isoDate.slice(5, 7))}`;
}

/** One line of text that saves on Enter or when left, and steps back on Escape. */
export function ReminderInput({ initial = '', keepOpen = false, placeholder = PLACEHOLDER, onSave, onClose }) {
  const [text, setText] = useState(initial);
  const inputRef = useRef(null);
  const settled = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const save = () => {
    if (!text.trim()) return false;
    onSave(text);
    return true;
  };

  return (
    <input
      ref={inputRef}
      className="path-rem__input"
      value={text}
      maxLength={REMINDER_MAX_LENGTH}
      placeholder={placeholder}
      aria-label="Υπενθύμιση"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (settled.current) return;
        save();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          // A new reminder keeps the field open for the next one; an empty Enter closes it.
          if (save() && keepOpen) {
            setText('');
            return;
          }
          settled.current = true;
          onClose();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          settled.current = true;
          onClose();
        }
      }}
    />
  );
}

/**
 * One reminder: a tick, its text (click to change) and a delete. A row in a day's list by
 * default; the hour grid renders it as a positioned chip (`as="div"` with its own class and style).
 */
export function PathReminderItem({
  path,
  block,
  today,
  as: Tag = 'li',
  className = '',
  style,
  draggable = false,
  dragging = false,
  onDelete,
  onDragStartReminder,
  onDragEndReminder,
}) {
  const [editing, setEditing] = useState(false);
  const open = isOpenReminder(block);
  const carried = isCarriedReminder(block, today);
  const classes = [
    'path-rem',
    className,
    block.status === 'Done' ? 'path-rem--done' : '',
    block.status === 'Skipped' ? 'path-rem--skipped' : '',
    carried ? 'path-rem--carried' : '',
    dragging ? 'path-rem--dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <Tag
      className={classes}
      style={style}
      draggable={Boolean(draggable) && open && !editing}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', block.id);
        event.dataTransfer.effectAllowed = 'move';
        // Like a block: the week shows where it lands, so no picture of the row is dragged.
        hideDragImage(event);
        onDragStartReminder?.(block);
      }}
      onDragEnd={() => onDragEndReminder?.()}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={block.status === 'Done'}
        aria-label={`Έγινε · ${block.title}`}
        className="path-rem__box"
        // Ticked now, whatever day it was written for: it stays on the day it got done.
        onClick={() => path.setBlockStatus(block.id, block.status === 'Done' ? 'Planned' : 'Done')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
      </button>
      {editing ? (
        <ReminderInput
          initial={reminderEditText(block)}
          onSave={(text) => {
            const next = renameReminder(block, text);
            if (next) path.upsertBlock(next);
          }}
          onClose={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          className="path-rem__text"
          title={block.title}
          aria-label={`Αλλαγή · ${block.title}`}
          onClick={() => setEditing(true)}
        >
          <span className="path-rem__title">
            {block.startTime ? <span className="path-rem__time">{block.startTime}</span> : null}
            {block.title}
          </span>
          {carried ? <span className="path-rem__from">από {shortDay(block.date)}</span> : null}
        </button>
      )}
      <button
        type="button"
        className="path-rem__del"
        aria-label={`Διαγραφή · ${block.title}`}
        onClick={() => onDelete(block)}
      >
        ✕
      </button>
    </Tag>
  );
}

/** The reminders showing on one day, each a line with a tick. Nothing renders when there are none. */
export function PathDayReminders({
  path,
  reminders,
  today,
  draggable = false,
  draggingId = null,
  onDelete,
  onDragStartReminder,
  onDragEndReminder,
}) {
  if (!reminders.length) return null;
  return (
    <ul className="path-rems" aria-label="Υπενθυμίσεις">
      {reminders.map((block) => (
        <PathReminderItem
          key={block.id}
          path={path}
          block={block}
          today={today}
          draggable={draggable}
          dragging={draggingId === block.id}
          onDelete={onDelete}
          onDragStartReminder={onDragStartReminder}
          onDragEndReminder={onDragEndReminder}
        />
      ))}
    </ul>
  );
}

/**
 * Adds reminders to a day. On the desktop week it is a small link that opens a field in
 * place; `alwaysOpen` (phone) keeps the field showing.
 */
export function PathReminderAdd({ path, date, alwaysOpen = false }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const add = (value) => {
    const reminder = createReminder(date, value);
    if (reminder) path.upsertBlock(reminder);
    return Boolean(reminder);
  };

  if (alwaysOpen) {
    return (
      <form
        className="path-rem-add path-rem-add--open"
        onSubmit={(event) => {
          event.preventDefault();
          if (add(text)) setText('');
        }}
      >
        <input
          className="path-rem__input"
          value={text}
          maxLength={REMINDER_MAX_LENGTH}
          placeholder={PLACEHOLDER}
          aria-label="Νέα υπενθύμιση"
          enterKeyHint="done"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="path-rem-add__go" aria-label="Πρόσθεσε υπενθύμιση" disabled={!text.trim()}>
          +
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button type="button" className="path-day__add path-rem-add" onClick={() => setOpen(true)}>
        + Υπενθύμιση
      </button>
    );
  }

  return (
    <div className="path-rem-add path-rem-add--open">
      <ReminderInput keepOpen onSave={add} onClose={() => setOpen(false)} />
    </div>
  );
}
