const INSIGHTS_KEY = 'lifev1-brain-insights';
const MAX_INSIGHTS = 80;

export function normalizeInsight(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  const body = String(raw.body || '').trim();
  if (!title && !body) return null;
  const sources = Array.isArray(raw.sources)
    ? raw.sources.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const confidence = Number(raw.confidence);
  return {
    id: raw.id || `insight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: ['insight', 'alert', 'suggestion', 'summary'].includes(raw.kind) ? raw.kind : 'insight',
    title: title || 'Insight',
    body,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    sources,
    createdAt: raw.createdAt || new Date().toISOString(),
    context: raw.context || null,
  };
}

export function loadBrainInsights() {
  try {
    const raw = localStorage.getItem(INSIGHTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return (Array.isArray(parsed) ? parsed : []).map(normalizeInsight).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveBrainInsights(insights) {
  const next = (Array.isArray(insights) ? insights : [])
    .map(normalizeInsight)
    .filter(Boolean)
    .slice(0, MAX_INSIGHTS);
  localStorage.setItem(INSIGHTS_KEY, JSON.stringify(next));
  return next;
}

export function prependBrainInsights(incoming, context) {
  const stamped = (Array.isArray(incoming) ? incoming : [])
    .map((item) => normalizeInsight({ ...item, context, createdAt: new Date().toISOString() }))
    .filter(Boolean);
  return saveBrainInsights([...stamped, ...loadBrainInsights()]);
}
