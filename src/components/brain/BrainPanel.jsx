import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBrainContextLabel } from '../../brain/context';
import { formatActiveBrainLabel, loadBrainConfig, saveBrainConfig, BRAIN_LEVELS } from '../../brain/config';
import { loadBrainPolicy, saveBrainPolicy } from '../../brain/policy';
import { runBrainJob } from '../../brain/runBrainJob';
import { shouldConfirmBrainActions } from '../../brain/actions';
import { resolveSource } from '../../brain/sources';
import {
  compactConversationHistory,
  createAssistantMessage,
  createEmptyConversation,
  createUserMessage,
  deleteConversation,
  listOpenConversations,
  loadActiveConversationId,
  loadConversations,
  saveActiveConversationId,
  titleFromText,
  upsertConversation,
} from '../../brain/conversations';
import { loadLocalProfile } from '../../brain/memory/localStore';
import {
  archiveConversationRemote,
  downloadMemoryBackup,
  persistConversations,
  persistProfile,
  syncMemoryRepository,
} from '../../brain/memory/repository';
import { platform } from '../../platform';
import {
  brainClearCloudKey,
  brainHasCloudKey,
  brainListRoots,
  brainPickFolder,
  brainRemoveRoot,
  brainSetCloudKey,
  hasElectronBrain,
} from '../../platform/brain';

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif)$/i;
const MAX_ATTACHMENTS = 6;

function createAttachmentId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: createAttachmentId(),
      kind: 'image',
      name: file.name || 'image',
      mime: file.type || 'image/png',
      dataUrl: String(reader.result || ''),
    });
    reader.onerror = () => reject(reader.error || new Error('Δεν διάβασα το αρχείο.'));
    reader.readAsDataURL(file);
  });
}

async function filesToAttachments(fileList) {
  const files = Array.from(fileList || []).filter((file) => IMAGE_MIME.test(file.type || ''));
  const results = [];
  for (const file of files) {
    try {
      results.push(await readFileAsAttachment(file));
    } catch {
      /* skip unreadable file */
    }
  }
  return results;
}

function formatChatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('el-GR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

async function copyToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`brain-copy${copied ? ' brain-copy--done' : ''}`}
      title={copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
      aria-label={copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
      onClick={async (event) => {
        event.stopPropagation();
        const ok = await copyToClipboard(text);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function assistantCopyText(message) {
  if (message?.error) return message.error;
  const insights = message?.insights || [];
  const body = insights
    .map((insight) => [insight.title, insight.body].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
  const created = message?.meta?.created?.message;
  return [body, created].filter(Boolean).join('\n\n');
}

function SourceChip({ sourceId, index, onOpenSource }) {
  const source = resolveSource(sourceId, index);
  const clickable = source.kind === 'project'
    || source.kind === 'checkpoint'
    || source.kind === 'note'
    || source.kind === 'lifeline-day'
    || source.kind === 'self'
    || source.kind === 'brand';
  if (!onOpenSource || !clickable) {
    return <span className="brain-insight__source">{source.label}</span>;
  }
  return (
    <button
      type="button"
      className="brain-insight__source brain-insight__source--btn"
      onClick={() => onOpenSource(source)}
      title={`Άνοιγμα: ${source.label}`}
    >
      {source.label}
    </button>
  );
}

function AssistantBubble({ message, onConfirm, onOpenSource, confirming }) {
  const created = message.meta?.created;
  const pendingActions = message.meta?.pendingActions;
  const sourceIndex = message.meta?.sourceIndex || [];
  const createdNote = created?.error ? (
    <p className="brain-msg__error">{created.error}</p>
  ) : created?.message ? (
    <p className={`brain-msg__created${created.created === false ? ' brain-msg__created--warn' : ''}`}>
      {created.message}
    </p>
  ) : null;
  const confirmNote = pendingActions?.length ? (
    <div className="brain-msg__confirm">
      <p>Να το φτιάξω στο app;</p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={confirming}
        onClick={() => onConfirm?.(message)}
      >
        {confirming ? 'Φτιάχνω…' : 'Ναι, φτιάξτο'}
      </button>
    </div>
  ) : null;
  const copy = <CopyButton text={assistantCopyText(message)} />;

  if (message.error) {
    return (
      <div className="brain-msg brain-msg--assistant">
        {copy}
        <p className="brain-msg__error">{message.error}</p>
      </div>
    );
  }

  const insights = message.insights || [];
  if (!insights.length) {
    return (
      <div className="brain-msg brain-msg--assistant">
        {copy}
        <p>Δεν πήρα απάντηση.</p>
        {createdNote}
        {confirmNote}
      </div>
    );
  }

  if (insights.length === 1 && (insights[0].kind === 'summary' || !insights[0].title || insights[0].title === 'Brain')) {
    return (
      <div className="brain-msg brain-msg--assistant">
        {copy}
        {insights[0].title && insights[0].title !== 'Brain' ? <h3>{insights[0].title}</h3> : null}
        {insights[0].body ? <p>{insights[0].body}</p> : null}
        {insights[0].sources?.length ? (
          <div className="brain-insight__sources">
            {insights[0].sources.map((source) => (
              <SourceChip key={source} sourceId={source} index={sourceIndex} onOpenSource={onOpenSource} />
            ))}
          </div>
        ) : null}
        {createdNote}
        {confirmNote}
      </div>
    );
  }

  return (
    <div className="brain-msg brain-msg--assistant brain-msg--cards">
      {copy}
      {insights.map((insight) => (
        <article key={insight.id} className={`brain-insight brain-insight--${insight.kind || 'insight'}`}>
          <p className="brain-insight__kind">{insight.kind}</p>
          <h3>{insight.title}</h3>
          {insight.body ? <p>{insight.body}</p> : null}
          {insight.sources?.length ? (
            <div className="brain-insight__sources">
              {insight.sources.map((source) => (
                <SourceChip key={source} sourceId={source} index={sourceIndex} onOpenSource={onOpenSource} />
              ))}
            </div>
          ) : null}
        </article>
      ))}
      {createdNote}
      {confirmNote}
    </div>
  );
}

function BrainSettings({
  config,
  policy,
  profile,
  updateProfile,
  cloudKey,
  cloudConfigured,
  setCloudKey,
  setCloudConfigured,
  updateConfig,
  updatePolicy,
}) {
  const [lawsDraft, setLawsDraft] = useState(() => (profile.laws || []).join('\n'));
  return (
    <div className="brain-settings">
      <div>
        <h3>Provider</h3>
        <label htmlFor="brain-provider">Προορισμός</label>
        <select
          id="brain-provider"
          value={config.providerId}
          onChange={(event) => updateConfig({ providerId: event.target.value })}
        >
          <option value="openai">OpenAI Responses</option>
          <option value="local">Local (Ollama)</option>
          <option value="custom">Custom OpenAI-compatible</option>
        </select>
        {config.providerId === 'openai' ? (
          <div className="brain-settings__ids">
            <p className="brain-settings__hint">Advanced: άλλαξε τα API IDs αν το OpenAI τα μετονομάσει. Το UI μένει Standard / Deep Think / Economy.</p>
            {BRAIN_LEVELS.map((level) => (
              <label key={level.id} htmlFor={`brain-id-${level.id}`}>
                {level.label} · {level.productName}
                <input
                  id={`brain-id-${level.id}`}
                  value={config.openaiLevelModels[level.id]}
                  onChange={(event) => updateConfig({
                    openaiLevelModels: {
                      ...config.openaiLevelModels,
                      [level.id]: event.target.value,
                    },
                  })}
                />
              </label>
            ))}
          </div>
        ) : null}
        {config.providerId === 'local' ? (
          <>
            <label htmlFor="brain-local-url">Local URL</label>
            <input
              id="brain-local-url"
              value={config.localBaseUrl}
              onChange={(event) => updateConfig({ localBaseUrl: event.target.value })}
              disabled={!platform.isElectron}
            />
            {!platform.isElectron ? (
              <p className="brain-settings__hint">Το 127.0.0.1 δουλεύει μόνο στο desktop. Στο web/Android βάλε Custom LAN URL.</p>
            ) : null}
          </>
        ) : null}
        {config.providerId === 'custom' ? (
          <>
            <label htmlFor="brain-custom-url">Custom URL</label>
            <input
              id="brain-custom-url"
              value={config.customBaseUrl}
              onChange={(event) => updateConfig({ customBaseUrl: event.target.value })}
              placeholder="http://192.168.1.10:1234/v1"
            />
          </>
        ) : null}
        {config.providerId === 'openai' && platform.isElectron ? (
          <>
            <label htmlFor="brain-cloud-key">OpenAI key (αποθηκεύεται στο OS, όχι στο React)</label>
            {cloudConfigured ? (
              <p className="brain-settings__hint">Key αποθηκευμένο στο desktop vault.</p>
            ) : (
              <input
                id="brain-cloud-key"
                type="password"
                value={cloudKey}
                onChange={(event) => setCloudKey(event.target.value)}
                autoComplete="off"
              />
            )}
            <div className="brain-panel__row">
              {cloudConfigured ? (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={async () => {
                    await brainClearCloudKey();
                    setCloudConfigured(false);
                  }}
                >
                  Remove key
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--outline"
                  disabled={!cloudKey.trim()}
                  onClick={async () => {
                    await brainSetCloudKey(cloudKey);
                    setCloudKey('');
                    setCloudConfigured(true);
                  }}
                >
                  Save key
                </button>
              )}
            </div>
          </>
        ) : null}
        {config.providerId === 'openai' && !platform.isElectron ? (
          <p className="brain-settings__hint">Στο web/Android το key μένει στην Edge Function, όχι στη συσκευή.</p>
        ) : null}
      </div>

      <div>
        <h3>Ποιος είσαι</h3>
        <p className="brain-settings__hint">Αυτό μένει στο Lifev1 και δίνεται σε κάθε μοντέλο. Δεν εξαρτάται από OpenAI conversation state.</p>
        <label htmlFor="brain-identity">Πώς θέλεις να λειτουργεί ο Brain</label>
        <textarea id="brain-identity" value={profile.identity} onChange={(event) => updateProfile({ identity: event.target.value })} />
        <label htmlFor="brain-values">Αξίες</label>
        <textarea id="brain-values" value={profile.values} onChange={(event) => updateProfile({ values: event.target.value })} />
        <label htmlFor="brain-goals">Στόχοι</label>
        <textarea id="brain-goals" value={profile.goals} onChange={(event) => updateProfile({ goals: event.target.value })} />
        <label htmlFor="brain-style">Προσωπικό ύφος</label>
        <textarea id="brain-style" value={profile.style} onChange={(event) => updateProfile({ style: event.target.value })} />
        <label htmlFor="brain-brand">Personal brand</label>
        <textarea id="brain-brand" value={profile.brand} onChange={(event) => updateProfile({ brand: event.target.value })} />
        <label htmlFor="brain-laws">Νόμοι αποφάσεων (ένας ανά γραμμή, μέχρι 10)</label>
        <textarea
          id="brain-laws"
          value={lawsDraft}
          onChange={(event) => setLawsDraft(event.target.value)}
          onBlur={() => updateProfile({
            laws: lawsDraft.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 10),
          })}
          placeholder={'π.χ.\nΈνας οικονομικός κινητήρας\nΛιγότερα projects, πιο κοφτερά\nΚύκλοι 90 ημερών'}
        />
        <p className="brain-settings__hint">Αυτοί οι νόμοι μπαίνουν πάντα στη μνήμη. Οι στρατηγικές απαντήσεις πρέπει να τους σέβονται.</p>
        <button type="button" className="btn btn--outline" onClick={() => downloadMemoryBackup()}>
          Εξαγωγή μνήμης
        </button>
      </div>

      <div>
        <h3>Πρόσβαση</h3>
        <label className="brain-settings__toggle">
          <span>Self</span>
          <input
            type="checkbox"
            checked={policy.appScopes.self}
            onChange={(event) => updatePolicy({
              appScopes: { ...policy.appScopes, self: event.target.checked },
            })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Lifeline / μέρες</span>
          <input
            type="checkbox"
            checked={policy.appScopes.lifeline}
            onChange={(event) => updatePolicy({
              appScopes: { ...policy.appScopes, lifeline: event.target.checked },
            })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Personal Brand</span>
          <input
            type="checkbox"
            checked={policy.appScopes.brand !== false}
            onChange={(event) => updatePolicy({
              appScopes: { ...policy.appScopes, brand: event.target.checked },
            })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Nutrition</span>
          <input
            type="checkbox"
            checked={policy.appScopes.nutrition !== false}
            onChange={(event) => updatePolicy({
              appScopes: { ...policy.appScopes, nutrition: event.target.checked },
            })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Projects / checkpoints</span>
          <input
            type="checkbox"
            checked={policy.appScopes.projects}
            onChange={(event) => updatePolicy({
              appScopes: { ...policy.appScopes, projects: event.target.checked },
            })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Σημειώσεις</span>
          <input
            type="checkbox"
            checked={policy.appScopes.notes}
            onChange={(event) => updatePolicy({
              appScopes: { ...policy.appScopes, notes: event.target.checked },
            })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Το AI βλέπει Self, Lifeline, Personal Brand και όλα τα projects</span>
          <input
            type="checkbox"
            checked={policy.cloudMaySeeAppData}
            onChange={(event) => updatePolicy({ cloudMaySeeAppData: event.target.checked })}
          />
        </label>
        <label className="brain-settings__toggle">
          <span>Το AI βλέπει τοπικούς φακέλους</span>
          <input
            type="checkbox"
            checked={policy.cloudMaySeeLocalFiles || (policy.roots || []).length > 0}
            onChange={(event) => updatePolicy({ cloudMaySeeLocalFiles: event.target.checked })}
          />
        </label>
        <p className="brain-settings__hint">Όταν προσθέτεις φάκελο, το Brain μπορεί να δει τα αρχεία του και να αναλύσει φωτογραφίες.</p>
      </div>

      <div>
        <h3>Τοπικοί φάκελοι</h3>
        {platform.isElectron ? (
          <>
            <div className="brain-settings__roots">
              {(policy.roots || []).map((root) => (
                <div key={root.rootId} className="brain-settings__root">
                  <span>{root.displayName}</span>
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={async () => {
                      const roots = await brainRemoveRoot(root.rootId);
                      updatePolicy({ roots: roots || [] });
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--outline"
              onClick={async () => {
                const picked = await brainPickFolder();
                if (!picked) return;
                const roots = await brainListRoots();
                updatePolicy({ roots, cloudMaySeeLocalFiles: true });
              }}
            >
              Add folder
            </button>
          </>
        ) : (
          <p className="brain-settings__hint">Η πρόσβαση σε αρχεία PC δουλεύει μόνο στο desktop app.</p>
        )}
      </div>
    </div>
  );
}

export function BrainPanel({
  mode,
  context,
  snapshotInput,
  contextExtras,
  onApplyBrainActions,
  onOpenSource,
  onClose,
  onExpand,
  onCollapse,
}) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState(loadConversations);
  const [profile, setProfile] = useState(loadLocalProfile);
  const [activeId, setActiveId] = useState(() => {
    const list = listOpenConversations(loadConversations());
    return loadActiveConversationId() || list[0]?.id || null;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(() => loadBrainConfig());
  const [policy, setPolicy] = useState(() => loadBrainPolicy());
  const [cloudKey, setCloudKey] = useState('');
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const expanded = mode === 'expanded';

  const addFiles = async (fileList) => {
    const next = await filesToAttachments(fileList);
    if (!next.length) return;
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const openConversations = useMemo(
    () => listOpenConversations(conversations),
    [conversations]
  );
  const active = useMemo(
    () => openConversations.find((item) => item.id === activeId) || openConversations[0] || createEmptyConversation(),
    [openConversations, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    syncMemoryRepository()
      .then((bundle) => {
        if (cancelled) return;
        setConversations(bundle.allConversations || bundle.conversations || []);
        setProfile(bundle.profile);
        if (bundle.activeConversationId) setActiveId(bundle.activeConversationId);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasElectronBrain()) return undefined;
    brainHasCloudKey().then((result) => setCloudConfigured(Boolean(result?.configured))).catch(() => {});
    brainListRoots().then((roots) => {
      setPolicy((prev) => saveBrainPolicy({ ...prev, roots: roots || [] }));
    }).catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [active.id, active.messages.length, busy]);

  const contextLabel = useMemo(
    () => formatBrainContextLabel(context, contextExtras),
    [context, contextExtras]
  );

  const selectConversation = (id) => {
    setActiveId(id);
    saveActiveConversationId(id);
    setSidebarOpen(false);
    setShowSettings(false);
  };

  const startConversation = () => {
    const next = createEmptyConversation();
    const list = upsertConversation(conversations, next);
    setConversations(list);
    persistConversations(list, next.id);
    selectConversation(next.id);
  };

  const removeConversation = (event, id) => {
    event.stopPropagation();
    const list = deleteConversation(conversations, id);
    setConversations(list);
    persistConversations(list);
    archiveConversationRemote(id);
    const nextId = loadActiveConversationId() || listOpenConversations(list)[0]?.id;
    setActiveId(nextId);
  };

  const run = async (kind) => {
    const text = String(draft || '').trim();
    const pendingAttachments = attachments;
    if (kind === 'ask' && !text && !pendingAttachments.length) return;

    const userText = kind === 'analyze'
      ? text || 'Ανάλυσε ό,τι βλέπεις στην εφαρμογή και πες μου την επόμενη κίνηση.'
      : kind === 'briefing'
        ? text || 'Κάνε weekly briefing: τι κινήθηκε, τι έχει κολλήσει, ποια είναι η επόμενη κίνηση.'
        : text;
    const userMessage = createUserMessage(userText, kind, pendingAttachments);
    const pending = {
      ...active,
      title: active.messages.length ? active.title : titleFromText(userText || 'Εικόνα'),
      messages: [...active.messages, userMessage],
    };
    const nextList = upsertConversation(conversations, pending);
    setConversations(nextList);
    persistConversations(nextList, pending.id);
    setDraft('');
    setAttachments([]);
    setBusy(true);

    try {
      const result = await runBrainJob({
        kind,
        question: userText,
        history: compactConversationHistory(pending.messages),
        conversationId: pending.id,
        liveContext: context,
        snapshotInput,
        userAttachments: pendingAttachments,
      });
      let created = null;
      const needsConfirm = shouldConfirmBrainActions(result.actions, userText);
      if (result.actions?.length && onApplyBrainActions && !needsConfirm) {
        try {
          created = await onApplyBrainActions(result.actions);
        } catch (err) {
          created = { created: false, error: err.message || 'Δεν μπόρεσα να το φτιάξω στο app.' };
        }
      }
      const assistant = createAssistantMessage({
        insights: result.insights,
        meta: {
          created,
          pendingActions: needsConfirm ? result.actions : null,
          sourceIndex: result.sourceIndex || [],
        },
      });
      setConversations((current) => {
        const latest = current.find((item) => item.id === pending.id) || pending;
        const saved = upsertConversation(current, {
          ...latest,
          messages: [...latest.messages, assistant],
        });
        persistConversations(saved, pending.id);
        return saved;
      });
    } catch (err) {
      const assistant = createAssistantMessage({ error: err.message || 'Αποτυχία απάντησης.' });
      setConversations((current) => {
        const latest = current.find((item) => item.id === pending.id) || pending;
        const saved = upsertConversation(current, {
          ...latest,
          messages: [...latest.messages, assistant],
        });
        persistConversations(saved, pending.id);
        return saved;
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async (message) => {
    const actions = message?.meta?.pendingActions;
    if (!actions?.length || !onApplyBrainActions) return;
    setBusy(true);
    try {
      const created = await onApplyBrainActions(actions);
      setConversations((current) => {
        const latest = current.find((item) => item.id === active.id) || active;
        const saved = upsertConversation(current, {
          ...latest,
          messages: (latest.messages || []).map((item) => (
            item.id === message.id
              ? { ...item, meta: { ...item.meta, pendingActions: null, created } }
              : item
          )),
        });
        persistConversations(saved, active.id);
        return saved;
      });
    } catch (err) {
      setConversations((current) => {
        const latest = current.find((item) => item.id === active.id) || active;
        const saved = upsertConversation(current, {
          ...latest,
          messages: (latest.messages || []).map((item) => (
            item.id === message.id
              ? { ...item, meta: { ...item.meta, created: { created: false, error: err.message || 'Δεν μπόρεσα να το φτιάξω στο app.' } } }
              : item
          )),
        });
        persistConversations(saved, active.id);
        return saved;
      });
    } finally {
      setBusy(false);
    }
  };

  const updateConfig = (patch) => {
    setConfig((prev) => saveBrainConfig({ ...prev, ...patch }));
  };

  const updatePolicy = (patch) => {
    setPolicy((prev) => saveBrainPolicy({ ...prev, ...patch }));
  };

  const updateProfile = (patch) => {
    setProfile((prev) => persistProfile({ ...prev, ...patch }));
  };

  return (
    <section className={`brain-panel brain-panel--chat${expanded ? ' brain-panel--expanded' : ''}${sidebarOpen ? ' brain-panel--sidebar-open' : ''}`}>
      <header className="brain-panel__header">
        <div className="brain-panel__heading">
          <p className="brain-panel__kicker">Brain · {formatActiveBrainLabel(config)}</p>
          <h2 className="brain-panel__title">{active.title}</h2>
          <p className="brain-panel__context">{contextLabel}</p>
          <p className="brain-panel__context">
            {(policy.roots || []).length
              ? `Τοπικοί φάκελοι: ${(policy.roots || []).map((root) => root.displayName).join(', ')}`
              : hasElectronBrain()
                ? 'Κανένας τοπικός φάκελος'
                : 'Οι τοπικοί φάκελοι δουλεύουν μόνο στο desktop app'}
          </p>
        </div>
        <div className="brain-panel__actions">
          <button
            type="button"
            className="brain-panel__icon-btn"
            onClick={() => setSidebarOpen((open) => !open)}
            title="Συνομιλίες"
          >
            ≡
          </button>
          <button type="button" className="brain-panel__icon-btn" onClick={startConversation} title="Νέα συνομιλία">
            +
          </button>
          <button
            type="button"
            className={`brain-panel__icon-btn${showSettings ? ' brain-panel__icon-btn--active' : ''}`}
            onClick={() => setShowSettings((open) => !open)}
            title="Ρυθμίσεις"
          >
            ⚙
          </button>
          {expanded ? (
            <button type="button" className="brain-panel__icon-btn" onClick={onCollapse} title="Σύμπτυξη">
              ▢
            </button>
          ) : (
            <button type="button" className="brain-panel__icon-btn" onClick={onExpand} title="Expand">
              ↗
            </button>
          )}
          <button type="button" className="brain-panel__icon-btn" onClick={onClose} title="Κλείσιμο">
            ×
          </button>
        </div>
      </header>

      <div className="brain-chat">
        <aside className="brain-chat__sidebar" aria-label="Συνομιλίες">
          <div className="brain-chat__sidebar-head">
            <h3>Συνομιλίες</h3>
            <button type="button" className="btn btn--outline" onClick={startConversation}>
              Νέα
            </button>
          </div>
          <div className="brain-chat__windows">
            {openConversations.map((conversation) => {
              const last = conversation.messages[conversation.messages.length - 1];
              const preview = last?.role === 'user'
                ? last.text
                : last?.error || last?.insights?.[0]?.title || 'Κενό παράθυρο';
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`brain-window${conversation.id === active.id ? ' brain-window--active' : ''}`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <span className="brain-window__title">{conversation.title}</span>
                  <span className="brain-window__preview">{preview}</span>
                  <span className="brain-window__meta">
                    <span>{formatChatTime(conversation.updatedAt)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="brain-window__delete"
                      onClick={(event) => removeConversation(event, conversation.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') removeConversation(event, conversation.id);
                      }}
                    >
                      Διαγραφή
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="brain-chat__main">
          {showSettings ? (
            <div className="brain-chat__settings">
              {config.providerId === 'openai' ? (
                <div className="brain-levels brain-levels--compact">
                  {BRAIN_LEVELS.map((item) => {
                    const selected = item.id === config.level;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`brain-level${selected ? ' brain-level--active' : ''}`}
                        onClick={() => updateConfig({ level: item.id })}
                      >
                        <span className="brain-level__name">{item.label}</span>
                        <span className="brain-level__product">{item.productName}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="brain-panel__compat-model">
                  <label htmlFor="brain-compat-model">Μοντέλο</label>
                  <input
                    id="brain-compat-model"
                    value={config.model}
                    onChange={(event) => updateConfig({ model: event.target.value })}
                    placeholder={config.providerId === 'custom' ? 'όνομα μοντέλου στο custom endpoint' : 'π.χ. llama3.1'}
                  />
                </div>
              )}
              <BrainSettings
                config={config}
                policy={policy}
                profile={profile}
                updateProfile={updateProfile}
                cloudKey={cloudKey}
                cloudConfigured={cloudConfigured}
                setCloudKey={setCloudKey}
                setCloudConfigured={setCloudConfigured}
                updateConfig={updateConfig}
                updatePolicy={updatePolicy}
              />
            </div>
          ) : (
            <>
              <div ref={threadRef} className="brain-chat__thread">
                {!active.messages.length && !busy ? (
                  <div className="brain-chat__empty">
                    <p>Νέα συνομιλία</p>
                    <span>Ρώτα για οποιοδήποτε project, το Self ή το Lifeline. Η απάντησή σου θα φαίνεται εδώ, όπως στο ChatGPT.</span>
                  </div>
                ) : null}
                {active.messages.map((message) => (
                  message.role === 'user' ? (
                    <div key={message.id} className="brain-msg brain-msg--user">
                      <CopyButton text={message.text || ''} />
                      {(message.attachments || []).length ? (
                        <div className="brain-msg__images">
                          {message.attachments.map((image) => (
                            <img
                              key={image.id}
                              src={image.dataUrl}
                              alt={image.name}
                              className="brain-msg__image"
                            />
                          ))}
                        </div>
                      ) : null}
                      {message.text ? <p>{message.text}</p> : null}
                    </div>
                  ) : (
                    <AssistantBubble
                      key={message.id}
                      message={message}
                      onConfirm={confirmPending}
                      onOpenSource={onOpenSource}
                      confirming={busy}
                    />
                  )
                ))}
                {busy ? (
                  <div className="brain-msg brain-msg--assistant brain-msg--pending">
                    <p>Σκέφτεται…</p>
                  </div>
                ) : null}
              </div>

              <form
                className={`brain-chat__composer${dragging ? ' brain-chat__composer--drag' : ''}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  run('ask');
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer?.types?.includes('Files')) {
                    event.preventDefault();
                    setDragging(true);
                  }
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
                }}
              >
                {attachments.length ? (
                  <div className="brain-chat__attachments">
                    {attachments.map((image) => (
                      <div key={image.id} className="brain-attachment">
                        <img src={image.dataUrl} alt={image.name} />
                        <button
                          type="button"
                          className="brain-attachment__remove"
                          onClick={() => removeAttachment(image.id)}
                          title="Αφαίρεση"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {config.providerId === 'openai' ? (
                  <div className="brain-chat__levels" role="radiogroup" aria-label="Επίπεδο Brain">
                    {BRAIN_LEVELS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={item.id === config.level}
                        className={`brain-chat__level${item.id === config.level ? ' brain-chat__level--active' : ''}`}
                        onClick={() => updateConfig({ level: item.id })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Γράψε μήνυμα ή σύρε μια εικόνα…"
                  rows={2}
                  disabled={busy}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData?.files || []);
                    if (files.some((file) => IMAGE_MIME.test(file.type || ''))) {
                      event.preventDefault();
                      addFiles(event.clipboardData.files);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      run('ask');
                    }
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
                <div className="brain-panel__row">
                  <button
                    type="button"
                    className="btn btn--outline"
                    disabled={busy || attachments.length >= MAX_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                    title="Επισύναψη εικόνας"
                  >
                    Εικόνα
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={busy || (!draft.trim() && !attachments.length)}>
                    {busy ? 'Σκέφτεται…' : 'Αποστολή'}
                  </button>
                  <button type="button" className="btn btn--outline" disabled={busy} onClick={() => run('analyze')}>
                    Analyze
                  </button>
                  <button type="button" className="btn btn--outline" disabled={busy} onClick={() => run('briefing')}>
                    Briefing
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
