import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildOpenRecords,
  buildSelfOpenList,
  listOpenItems,
  openItemsCloudReady,
  openRecordsEqual,
  openSourceLabel,
  setOpenItemStatus,
} from '../../../lib/assistant/openItems';
import { getAssistantRun, pullAssistantNow } from '../../../lib/assistant/pull';
import { defaultBlockDoneAt, formatBlockWindow } from '../../../lib/path/logic';
import { parseLocalDate } from '../../../lib/path/schema';
import { setPathBlockStatus } from '../../../lib/path/store';
import { localTodayIsoDate } from '../../../utils/selfDateUtils';
import { getDayEntry } from '../../../utils/lifelineDays';
import { platform } from '../../../platform';
import './SelfOpenItems.css';

// On a phone a long open list pushes the rest of Self thousands of pixels down.
const MOBILE_VISIBLE_LIMIT = 5;
const NO_BLOCKS = [];
const DAY_LABEL = new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: 'numeric', month: 'short' });

function dayLabel(isoDate) {
  const date = parseLocalDate(isoDate);
  return date ? DAY_LABEL.format(date) : isoDate;
}

function rowMeta(row, today) {
  const parts = [];
  if (row.kind === 'block') {
    parts.push(openSourceLabel('day'));
    const slot = formatBlockWindow(row.block.startTime, row.block.duration);
    if (slot) parts.push(slot);
  } else {
    parts.push(row.item.level === 'business' ? 'Επιχείρηση' : 'Άνθρωπος', openSourceLabel(row.item.source));
  }
  if (row.date && row.date !== today) parts.push(dayLabel(row.date));
  if (row.status === 'skipped') parts.push('παράλειψη');
  return parts.join(' · ');
}

export function SelfOpenItems({ lifelineDays = {}, onUpdateLifelineDay, pathBundle = null }) {
  const [items, setItems] = useState([]);
  const [run, setRun] = useState(null);
  const [canPull, setCanPull] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const synced = useRef('');

  const blocks = pathBundle?.blocks || NO_BLOCKS;
  const today = localTodayIsoDate();

  const reload = async () => {
    const [next, latest, cloud] = await Promise.all([
      listOpenItems(),
      getAssistantRun().catch(() => null),
      openItemsCloudReady().catch(() => false),
    ]);
    setItems(next.filter((item) => item.status !== 'deleted'));
    setRun(latest);
    setCanPull(cloud);
    setLoaded(true);
  };

  useEffect(() => {
    reload().catch((err) => setError(err.message || 'Δεν φορτώθηκαν οι εκκρεμότητες.'));
  }, []);

  useEffect(() => {
    if (!loaded || !onUpdateLifelineDay) return;
    const records = buildOpenRecords({ items, blocks, today });
    const patches = [];
    for (const [date, next] of Object.entries(records)) {
      const current = getDayEntry(lifelineDays, date).openRecord;
      if (!openRecordsEqual(current, next)) {
        patches.push([date, { ...next, updatedAt: new Date().toISOString() }]);
      }
    }
    const signature = patches
      .map(([date, record]) => `${date}:${record.done.map((item) => item.id).join(',')}:${record.missed.map((item) => item.id).join(',')}`)
      .join('|');
    if (!patches.length || signature === synced.current) return;
    synced.current = signature;
    for (const [date, record] of patches) {
      onUpdateLifelineDay(date, { openRecord: record });
    }
  }, [loaded, items, blocks, today, lifelineDays, onUpdateLifelineDay]);

  const list = useMemo(() => buildSelfOpenList({ items, blocks, today }), [items, blocks, today]);

  const pull = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await pullAssistantNow();
      setRun({
        pulled_at: new Date().toISOString(),
        mail_connected: result.mailConnected,
        erp_connected: result.erpConnected,
        mail_count: result.mailCount,
        erp_count: result.erpCount,
        item_count: result.itemCount,
      });
      await reload();
    } catch (err) {
      setError(err.message || 'Το τράβηγμα απέτυχε.');
    } finally {
      setBusy(false);
    }
  };

  const markItem = async (item, status) => {
    if (status === 'deleted' && !window.confirm(`Διαγραφή «${item.title}»;`)) return;
    setError('');
    try {
      await setOpenItemStatus(item.id, status);
      await reload();
    } catch (err) {
      setError(err.message || 'Δεν ενημερώθηκε.');
    }
  };

  // Plan blocks change in Path itself, so Path, Self and Lifeline see the same status.
  const markBlock = (block, status) => {
    setError('');
    const at = status === 'Done' ? defaultBlockDoneAt(block) : undefined;
    if (!setPathBlockStatus(block.id, status, at)) {
      setError('Το block δεν βρέθηκε στο Path.');
    }
  };

  const reopen = (row) => (
    row.kind === 'block' ? markBlock(row.block, 'Planned') : markItem(row.item, 'open')
  );

  const openCount = list.today.length + list.overdue.length;
  const collapsible = platform.isMobile && openCount > MOBILE_VISIBLE_LIMIT;
  const limit = collapsible && !expanded ? MOBILE_VISIBLE_LIMIT : Infinity;
  const todayShown = list.today.slice(0, limit);
  const overdueShown = list.overdue.slice(0, Math.max(0, limit - todayShown.length));

  const renderOpenRow = (row) => (
    <li key={row.key} className="self-open__row">
      <div>
        <strong>{row.title}</strong>
        <p>{rowMeta(row, today)}</p>
      </div>
      <div className="self-open__actions">
        {row.kind === 'block' ? (
          <>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => markBlock(row.block, 'Done')}>
              Έγινε
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => markBlock(row.block, 'Skipped')}>
              Παράλειψη
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => markItem(row.item, 'done')}>
              Έγινε
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => markItem(row.item, 'deleted')}>
              Διαγραφή
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <section className="self-open" aria-label="Εκκρεμότητες">
      <header className="self-open__header">
        <div>
          <p className="self-open__eyebrow">Εκκρεμότητες</p>
          <p className="self-open__count">{openCount}</p>
        </div>
        {canPull ? (
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={pull}>
            {busy ? 'Τραβάει…' : 'Τράβηξε τώρα'}
          </button>
        ) : null}
      </header>
      <p className="self-open__note">
        {canPull
          ? 'Το weekly plan φαίνεται εδώ αμέσως. Mail και κλήσεις έρχονται κάθε πρωί στις 7 ή με «Τράβηξε τώρα».'
          : 'Το weekly plan φαίνεται εδώ αμέσως. Για mail και κλήσεις χρειάζεται σύνδεση στο cloud.'}
      </p>
      {canPull && run?.pulled_at ? (
        <p className="self-open__note">
          Τελευταίο τράβηγμα {new Date(run.pulled_at).toLocaleString('el-GR')}
          {typeof run.item_count === 'number' ? ` · νέες ${run.item_count}` : ''}
        </p>
      ) : null}
      {error ? <p className="self-open__error">{error}</p> : null}

      <div className="self-open__group">
        <p className="self-open__eyebrow">Σήμερα</p>
        <ul className="self-open__list">
          {todayShown.map(renderOpenRow)}
          {!list.today.length ? <li className="self-open__empty">Τίποτα ανοιχτό σήμερα.</li> : null}
        </ul>
      </div>

      {overdueShown.length ? (
        <div className="self-open__group">
          <p className="self-open__eyebrow">Καθυστερημένες ({list.overdue.length})</p>
          <ul className="self-open__list">{overdueShown.map(renderOpenRow)}</ul>
        </div>
      ) : null}

      {collapsible ? (
        <button
          type="button"
          className="self-open__more"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Λιγότερες' : `Δείξε όλες (${openCount})`}
        </button>
      ) : null}

      {list.closedToday.length ? (
        <div className="self-open__group">
          <button
            type="button"
            className="self-open__more"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((value) => !value)}
          >
            {showClosed ? 'Κρύψε όσα έκλεισαν σήμερα' : `Έκλεισαν σήμερα (${list.closedToday.length})`}
          </button>
          {showClosed ? (
            <ul className="self-open__list">
              {list.closedToday.map((row) => (
                <li key={row.key} className="self-open__row self-open__row--done">
                  <div>
                    <strong>{row.title}</strong>
                    <p>{rowMeta(row, today)}</p>
                  </div>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => reopen(row)}>
                    Ξανά ανοιχτό
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
