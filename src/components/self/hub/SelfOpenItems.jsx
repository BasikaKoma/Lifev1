import { useEffect, useRef, useState } from 'react';
import {
  listOpenItems,
  openRecordsByDate,
  openRecordsEqual,
  openSourceLabel,
  setOpenItemStatus,
} from '../../../lib/assistant/openItems';
import { getAssistantRun, pullAssistantNow } from '../../../lib/assistant/pull';
import { localTodayIsoDate } from '../../../utils/selfDateUtils';
import { getDayEntry } from '../../../utils/lifelineDays';
import './SelfOpenItems.css';

export function SelfOpenItems({ lifelineDays = {}, onUpdateLifelineDay }) {
  const [items, setItems] = useState([]);
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const synced = useRef('');
  const touched = useRef(new Set());

  const reload = async () => {
    const [next, latest] = await Promise.all([
      listOpenItems(),
      getAssistantRun().catch(() => null),
    ]);
    const visible = next.filter((item) => item.status !== 'deleted');
    setItems(visible);
    setRun(latest);
    setLoaded(true);
    return visible;
  };

  useEffect(() => {
    reload().catch((err) => setError(err.message || 'Δεν φορτώθηκαν οι εκκρεμότητες.'));
  }, []);

  useEffect(() => {
    if (!loaded || !onUpdateLifelineDay) return;
    const today = localTodayIsoDate();
    const records = openRecordsByDate(items, today);
    const dates = new Set([...Object.keys(records), ...touched.current]);
    const patches = [];
    for (const date of dates) {
      const next = records[date] || { done: [], missed: [] };
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
  }, [loaded, items, lifelineDays, onUpdateLifelineDay]);

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

  const mark = async (item, status) => {
    if (status === 'deleted' && !window.confirm(`Διαγραφή «${item.title}»;`)) return;
    touched.current.add(item.dueOn || localTodayIsoDate());
    setError('');
    try {
      await setOpenItemStatus(item.id, status);
      await reload();
    } catch (err) {
      setError(err.message || 'Δεν ενημερώθηκε.');
    }
  };

  const open = items.filter((item) => item.status === 'open');
  const done = items.filter((item) => item.status === 'done');

  return (
    <section className="self-open" aria-label="Εκκρεμότητες">
      <header className="self-open__header">
        <div>
          <p className="self-open__eyebrow">Εκκρεμότητες</p>
          <p className="self-open__count">{open.length}</p>
        </div>
        <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={pull}>
          {busy ? 'Τραβάει…' : 'Τράβηξε τώρα'}
        </button>
      </header>
      <p className="self-open__note">
        Κάθε πρωί στις 7 γράφονται μόνες τους. Κάθε μέρα στο Lifeline κρατάει τι έγινε και τι έμεινε.
      </p>
      {run?.pulled_at ? (
        <p className="self-open__note">
          Τελευταίο τράβηγμα {new Date(run.pulled_at).toLocaleString('el-GR')}
          {typeof run.item_count === 'number' ? ` · νέες ${run.item_count}` : ''}
        </p>
      ) : null}
      {error ? <p className="self-open__error">{error}</p> : null}

      <ul className="self-open__list">
        {open.map((item) => (
          <li key={item.id} className="self-open__row">
            <div>
              <strong>{item.title}</strong>
              <p>
                {item.level === 'business' ? 'Επιχείρηση' : 'Άνθρωπος'}
                {' · '}
                {openSourceLabel(item.source)}
                {item.dueOn ? ` · ${item.dueOn}` : ''}
              </p>
            </div>
            <div className="self-open__actions">
              <button type="button" className="btn btn--outline btn--sm" onClick={() => mark(item, 'done')}>
                Έγινε
              </button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => mark(item, 'deleted')}>
                Διαγραφή
              </button>
            </div>
          </li>
        ))}
        {!open.length ? <li className="self-open__empty">Τίποτα ανοιχτό σήμερα.</li> : null}
      </ul>

      {done.length ? (
        <div className="self-open__done">
          <p className="self-open__eyebrow">Έγιναν</p>
          <ul className="self-open__list">
            {done.map((item) => (
              <li key={item.id} className="self-open__row self-open__row--done">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.dueOn || 'Χωρίς ημερομηνία'}</p>
                </div>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => mark(item, 'open')}>
                  Ξανά ανοιχτό
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
