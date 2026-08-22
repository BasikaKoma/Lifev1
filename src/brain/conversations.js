const STORE_KEY = 'lifev1-brain-conversations';
const ACTIVE_KEY = 'lifev1-brain-active-conversation';

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createConversationId() {
  return createId('chat');
}

export function createMessageId() {
  return createId('msg');
}

export function titleFromText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return 'Νέα συνομιλία';
  return value.length > 42 ? `${value.slice(0, 41)}…` : value;
}

export function createEmptyConversation() {
  const createdAt = nowIso();
  return {
    id: createConversationId(),
    title: 'Νέα συνομιλία',
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
}

function normalizeAttachments(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const dataUrl = String(item.dataUrl || '');
      if (!dataUrl.startsWith('data:')) return null;
      return {
        id: item.id || createMessageId(),
        kind: 'image',
        name: String(item.name || 'image'),
        mime: String(item.mime || 'image/png'),
        dataUrl,
      };
    })
    .filter(Boolean);
}

export function createUserMessage(text, kind = 'ask', attachments = []) {
  return {
    id: createMessageId(),
    role: 'user',
    kind,
    text: String(text || '').trim(),
    attachments: normalizeAttachments(attachments),
    createdAt: nowIso(),
  };
}

export function createAssistantMessage({ insights = [], error = null, meta = {} } = {}) {
  return {
    id: createMessageId(),
    role: 'assistant',
    insights: Array.isArray(insights) ? insights : [],
    error: error ? String(error) : null,
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt: nowIso(),
  };
}

function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const role = raw.role === 'assistant' ? 'assistant' : 'user';
  return {
    id: raw.id || createMessageId(),
    role,
    kind: raw.kind === 'analyze' ? 'analyze' : 'ask',
    text: String(raw.text || ''),
    attachments: normalizeAttachments(raw.attachments),
    insights: Array.isArray(raw.insights) ? raw.insights : [],
    error: raw.error ? String(raw.error) : null,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
    createdAt: raw.createdAt || nowIso(),
  };
}

export function normalizeConversation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .map(normalizeMessage)
    .filter(Boolean);
  return {
    id: raw.id || createConversationId(),
    title: String(raw.title || 'Νέα συνομιλία').trim() || 'Νέα συνομιλία',
    archivedAt: raw.archivedAt || raw.archived_at || null,
    createdAt: raw.createdAt || raw.created_at || nowIso(),
    updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || nowIso(),
    messages,
  };
}

export function loadConversations() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = (Array.isArray(parsed) ? parsed : []).map(normalizeConversation).filter(Boolean);
    if (list.length) return list;
  } catch {
    /* ignore */
  }
  const first = createEmptyConversation();
  saveConversations([first]);
  saveActiveConversationId(first.id);
  return [first];
}

export function saveConversations(conversations) {
  const next = (Array.isArray(conversations) ? conversations : [])
    .map(normalizeConversation)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  localStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export function loadActiveConversationId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveActiveConversationId(id) {
  if (!id) {
    localStorage.removeItem(ACTIVE_KEY);
    return null;
  }
  localStorage.setItem(ACTIVE_KEY, id);
  return id;
}

export function upsertConversation(conversations, conversation) {
  const next = normalizeConversation({
    ...conversation,
    updatedAt: nowIso(),
  });
  const list = [next, ...(conversations || []).filter((item) => item.id !== next.id)];
  return saveConversations(list);
}

export function listOpenConversations(conversations) {
  return (conversations || []).filter((item) => !item.archivedAt);
}

export function archiveConversation(conversations, id) {
  const stamped = nowIso();
  const next = (conversations || []).map((item) => (
    item.id === id ? { ...item, archivedAt: stamped, updatedAt: stamped } : item
  ));
  const open = listOpenConversations(next);
  if (!open.length) {
    const first = createEmptyConversation();
    saveActiveConversationId(first.id);
    return saveConversations([first, ...next]);
  }
  const active = loadActiveConversationId();
  if (active === id) saveActiveConversationId(open[0].id);
  return saveConversations(next);
}

export function deleteConversation(conversations, id) {
  return archiveConversation(conversations, id);
}

export function compactConversationHistory(messages = []) {
  return (messages || [])
    .map((message) => {
      if (message.role === 'user') {
        const imageCount = (message.attachments || []).length;
        const base = String(message.text || '').trim();
        const text = imageCount
          ? `${base}${base ? ' ' : ''}[επισυναπτόμενες εικόνες: ${imageCount}]`.trim()
          : base;
        return { role: 'user', text };
      }
      if (message.error) return { role: 'assistant', text: String(message.error) };
      const insights = message.insights || [];
      const text = insights
        .map((item) => [item.title, item.body].filter(Boolean).join(': '))
        .join('\n')
        .trim();
      return { role: 'assistant', text };
    })
    .filter((item) => item.text)
    .slice(-16);
}
