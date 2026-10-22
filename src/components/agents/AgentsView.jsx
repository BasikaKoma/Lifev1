import { useCallback, useEffect, useState } from 'react';
import {
  getAgentRunReport,
  listAgentRuns,
  listMailAgents,
  listOpenTriage,
  nextAgentRun,
  runMailAgentNow,
  setAgentEnabled,
  subscribeAgentRuns,
  TRIAGE_META,
  TRIAGE_ORDER,
  zohoMailUrl,
} from '../../lib/agents';
import './agents.css';

const TABS = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'history', label: 'Ιστορικό' },
];

const RUN_STATUS = {
  running: { label: 'Τρέχει', tone: 'info' },
  ok: { label: 'OK', tone: 'ok' },
  partial: { label: 'Με προβλήματα', tone: 'warn' },
  error: { label: 'Σφάλμα', tone: 'danger' },
};

const EVENT_ICON = { sync: '↻', push: '🔔', skip: '…', error: '⚠' };

// Same as the server: a run still "running" after 10′ has stopped.
const RUN_STALE_MS = 10 * 60 * 1000;

const dateTime = new Intl.DateTimeFormat('el-GR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const timeOnly = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' });

function relativeTime(iso, now) {
  if (!iso) return '';
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'μόλις τώρα';
  if (minutes < 60) return `πριν ${minutes}′`;
  if (minutes < 24 * 60) return `πριν ${Math.round(minutes / 60)} ώρ.`;
  return dateTime.format(new Date(iso));
}

function nextRunLabel(date, now) {
  if (!date) return '';
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? `σήμερα ${timeOnly.format(date)}` : dateTime.format(date);
}

function duration(run) {
  if (!run.finished_at) return '';
  const seconds = Math.max(0, Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000));
  return seconds < 60 ? `${seconds}″` : `${Math.floor(seconds / 60)}′ ${seconds % 60}″`;
}

function senderName(from) {
  const match = String(from || '').match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  return (match?.[1] || from || '').trim() || 'Άγνωστος αποστολέας';
}

function isRunning(run, now) {
  return run?.status === 'running' && now.getTime() - new Date(run.started_at).getTime() < RUN_STALE_MS;
}

function StatusPill({ label, tone }) {
  return <span className={`agents-pill agents-pill--${tone}`}>{label}</span>;
}

function MailLine({ item, now }) {
  const message = item.mail_messages || {};
  const meta = TRIAGE_META[item.category] || TRIAGE_META.info;
  return (
    <li className="agents-mail">
      <span className="agents-mail__badge" title={meta.label} aria-label={meta.label}>{meta.emoji}</span>
      <div className="agents-mail__body">
        <div className="agents-mail__top">
          <strong>{senderName(message.from_addr)}</strong>
          <span className="agents-muted">{relativeTime(message.received_at, now)}</span>
        </div>
        <div className="agents-mail__subject">{message.subject || '(χωρίς θέμα)'}</div>
        {item.reason ? <div className="agents-mail__reason">{item.reason}</div> : null}
      </div>
      <a className="agents-link" href={zohoMailUrl(message)} target="_blank" rel="noopener noreferrer">
        Άνοιγμα στο Zoho
      </a>
    </li>
  );
}

function AgentCard({ mailbox, lastRun, now, busy, onRun, onToggle }) {
  const { agent } = mailbox;
  const running = busy || isRunning(lastRun, now);
  let pill = { label: 'Σε αναμονή', tone: 'idle' };
  if (agent && !agent.enabled) pill = { label: 'Ανενεργός', tone: 'idle' };
  if (lastRun?.status === 'error' || lastRun?.status === 'partial') pill = RUN_STATUS[lastRun.status];
  if (running) pill = RUN_STATUS.running;
  const next = agent?.enabled === false || mailbox.disconnected ? null : nextAgentRun(now);

  return (
    <article className="agents-card">
      <header className="agents-card__head">
        <div>
          <h2 className="agents-card__title">Mail · {mailbox.email || 'Zoho'}</h2>
          <p className="agents-muted">
            Κατατάσσει τα νέα mail σε 🔴 🟠 🔵 ⚪ και σε ειδοποιεί για όσα θέλουν απάντηση. Δεν στέλνει ποτέ.
          </p>
        </div>
        <StatusPill {...pill} />
      </header>

      <dl className="agents-card__facts">
        <div>
          <dt>Τελευταία εκτέλεση</dt>
          <dd>
            {lastRun ? (
              <>
                {relativeTime(lastRun.started_at, now)}
                {lastRun.summary ? <span className="agents-muted"> · {lastRun.summary}</span> : null}
              </>
            ) : 'Δεν έχει τρέξει ακόμα'}
          </dd>
        </div>
        <div>
          <dt>Επόμενη</dt>
          <dd>
            {mailbox.disconnected
              ? 'Το mailbox αποσυνδέθηκε'
              : next ? nextRunLabel(next, now) : 'Μόνο με το κουμπί'}
          </dd>
        </div>
      </dl>

      {lastRun?.error && !running ? <p className="agents-error">{lastRun.error}</p> : null}

      <div className="agents-card__actions">
        <button
          type="button"
          className="agents-btn agents-btn--primary"
          disabled={running || mailbox.disconnected}
          onClick={() => onRun(mailbox.ref)}
        >
          {running ? 'Τρέχει…' : 'Τρέξε τώρα'}
        </button>
        {agent ? (
          <label className="agents-toggle">
            <input
              type="checkbox"
              checked={agent.enabled}
              onChange={(e) => onToggle(agent.id, e.target.checked)}
            />
            <span>Κάθε ώρα, 08:00–20:00</span>
          </label>
        ) : null}
      </div>
    </article>
  );
}

function RunReport({ run, now }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    getAgentRunReport(run.id)
      .then((data) => { if (!cancelled) setReport(data); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Δεν φόρτωσε η αναφορά.'); });
    return () => { cancelled = true; };
  }, [run.id, run.status]);

  if (error) return <p className="agents-error">{error}</p>;
  if (!report) return <p className="agents-muted">Φόρτωση…</p>;

  const groups = TRIAGE_ORDER
    .map((category) => ({ category, items: report.triage.filter((item) => item.category === category) }))
    .filter((group) => group.items.length);

  return (
    <div className="agents-report">
      {groups.length ? groups.map((group) => (
        <section key={group.category} className="agents-report__group">
          <h3>
            {TRIAGE_META[group.category].emoji} {TRIAGE_META[group.category].label}
            <span className="agents-muted"> · {group.items.length}</span>
          </h3>
          <ul className="agents-mails">
            {group.items.map((item) => <MailLine key={item.message_id} item={item} now={now} />)}
          </ul>
        </section>
      )) : <p className="agents-muted">Δεν κατατάχθηκε κανένα mail σε αυτή την εκτέλεση.</p>}

      {report.events.length ? (
        <section className="agents-report__group">
          <h3>Βήματα</h3>
          <ul className="agents-events">
            {report.events.map((event) => (
              <li key={event.id} className={`agents-event agents-event--${event.kind}`}>
                <span aria-hidden="true">{EVENT_ICON[event.kind] || '·'}</span>
                <span>{event.title}</span>
                <span className="agents-muted">{timeOnly.format(new Date(event.at))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="agents-muted agents-report__meta">
        {run.model || 'claude-haiku-5-5'} · {run.tokens_in.toLocaleString('el-GR')} tokens εισόδου ·{' '}
        {run.tokens_out.toLocaleString('el-GR')} εξόδου{duration(run) ? ` · ${duration(run)}` : ''}
      </p>
    </div>
  );
}

function RunHistory({ runs, mailboxes, now }) {
  const [openId, setOpenId] = useState(null);
  if (!runs.length) return <p className="agents-empty">Δεν υπάρχουν ακόμα εκτελέσεις.</p>;
  const nameFor = (agentId) => mailboxes.find((box) => box.agent?.id === agentId)?.email || 'Mail';

  return (
    <ul className="agents-runs">
      {runs.map((run) => {
        const status = isRunning(run, now)
          ? RUN_STATUS.running
          : RUN_STATUS[run.status === 'running' ? 'error' : run.status] || RUN_STATUS.ok;
        const open = openId === run.id;
        return (
          <li key={run.id} className={`agents-run${open ? ' agents-run--open' : ''}`}>
            <button type="button" className="agents-run__row" aria-expanded={open} onClick={() => setOpenId(open ? null : run.id)}>
              <span className="agents-run__when">{dateTime.format(new Date(run.started_at))}</span>
              <span className="agents-muted">{run.trigger === 'manual' ? 'Χειροκίνητη' : 'Αυτόματη'} · {nameFor(run.agent_id)}</span>
              <StatusPill {...status} />
              <span className="agents-run__summary">{run.summary || run.error || ''}</span>
            </button>
            {open ? <RunReport run={run} now={now} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AgentsView({ user }) {
  const [tab, setTab] = useState('overview');
  const [mailboxes, setMailboxes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [openItems, setOpenItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyRef, setBusyRef] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    try {
      const [boxes, runList, open] = await Promise.all([listMailAgents(), listAgentRuns(), listOpenTriage()]);
      setMailboxes(boxes);
      setRuns(runList);
      setOpenItems(open);
      setError(null);
    } catch (err) {
      setError(err.message || 'Δεν φόρτωσαν οι agents.');
    } finally {
      setLoading(false);
      setNow(new Date());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id) return undefined;
    return subscribeAgentRuns(user.id, refresh);
  }, [user?.id, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleRun = async (ref) => {
    setBusyRef(ref);
    setError(null);
    try {
      await runMailAgentNow(ref);
    } catch (err) {
      setError(err.message || 'Η εκτέλεση απέτυχε.');
    } finally {
      setBusyRef(null);
      refresh();
    }
  };

  const handleToggle = async (agentId, enabled) => {
    try {
      await setAgentEnabled(agentId, enabled);
    } catch (err) {
      setError(err.message || 'Δεν άλλαξε η ρύθμιση.');
    }
    refresh();
  };

  const lastRunFor = (agentId) => (agentId ? runs.find((run) => run.agent_id === agentId) : null);
  const waiting = [...openItems].sort((a, b) => (
    new Date(b.mail_messages?.received_at || 0) - new Date(a.mail_messages?.received_at || 0)
  ));

  return (
    <section className="agents-view">
      <header className="agents-view__header">
        <h1 className="agents-view__title">Agents</h1>
        <p className="agents-view__lede">Τι έκαναν οι agents σου, τι βρήκαν, και τι περιμένει εσένα.</p>
      </header>

      <nav className="agents-tabs" aria-label="Agents">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <p className="agents-error">{error}</p> : null}

      {loading ? <p className="agents-empty">Φόρτωση…</p> : null}

      {!loading && tab === 'overview' ? (
        <>
          {mailboxes.length ? (
            <div className="agents-cards">
              {mailboxes.map((mailbox) => (
                <AgentCard
                  key={mailbox.ref}
                  mailbox={mailbox}
                  lastRun={lastRunFor(mailbox.agent?.id)}
                  now={now}
                  busy={busyRef === mailbox.ref}
                  onRun={handleRun}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          ) : (
            <p className="agents-empty">
              Δεν υπάρχει συνδεδεμένο Zoho Mail. Σύνδεσέ το στις Ρυθμίσεις → Συνδέσεις βοηθού.
            </p>
          )}

          <section className="agents-section">
            <h2 className="agents-section__title">
              Σε περιμένουν{waiting.length ? <span className="agents-muted"> · {waiting.length}</span> : null}
            </h2>
            {waiting.length ? (
              <ul className="agents-mails">
                {waiting.map((item) => <MailLine key={item.message_id} item={item} now={now} />)}
              </ul>
            ) : (
              <p className="agents-empty">Κανένα mail δεν περιμένει απάντηση ή ενέργεια.</p>
            )}
          </section>
        </>
      ) : null}

      {!loading && tab === 'history' ? <RunHistory runs={runs} mailboxes={mailboxes} now={now} /> : null}
    </section>
  );
}
