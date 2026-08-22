export const BRAND_TABS = [
  { id: 'hub', label: 'Hub' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'create', label: 'Create' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'library', label: 'Library' },
  { id: 'dna', label: 'Brand DNA' },
];

export const PIPELINE_STAGES = [
  { id: 'idea', label: 'Ideas', hint: 'Capture everything' },
  { id: 'selected', label: 'Selected', hint: 'Worth pursuing' },
  { id: 'drafting', label: 'Drafting', hint: 'In progress' },
  { id: 'ready', label: 'Ready', hint: 'Ready to publish' },
  { id: 'published', label: 'Published', hint: 'Out in the world' },
];

export const CAPTURE_KINDS = [
  { id: 'thought', label: 'Thought' },
  { id: 'lesson', label: 'Lesson' },
  { id: 'decision', label: 'Decision' },
  { id: 'failure', label: 'Failure' },
  { id: 'project_update', label: 'Project update' },
  { id: 'question', label: 'Question' },
];

export const BRAND_PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X' },
  { id: 'reel', label: 'Reel' },
  { id: 'carousel', label: 'Carousel' },
];

export const BRAND_PILLARS = [
  {
    id: 'entrepreneurship',
    label: 'Entrepreneurship',
    hint: 'Πραγματικά προβλήματα, όχι θεωρία.',
  },
  {
    id: 'building',
    label: 'Building in public',
    hint: 'Symphon, Lifev1, Lifeeffect.',
  },
  {
    id: 'decisions',
    label: 'Decisions & failures',
    hint: 'Αλλαγές πορείας, δυσκολίες, αποτυχίες.',
  },
  {
    id: 'self',
    label: 'Self-awareness',
    hint: 'Διαλογισμός, συνείδηση, πειράματα.',
  },
  {
    id: 'ai',
    label: 'AI & human',
    hint: 'AI ως ενίσχυση του ανθρώπου, όχι αντικατάσταση.',
  },
];

export const EXCLUDED_BRAND_PROJECTS = /nobelle/i;
export const LESSON_ONLY_PROJECTS = /market\s*portal|marketportal/i;
export const CORE_BRAND_PROJECTS = /symphon|lifev1|life\s*v1|lifeeffect|life effect/i;

export function createBrandId(prefix = 'brand') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createEmptyDna() {
  return {
    whoYouAre: '',
    standFor: '',
    audience: '',
    voice: 'Πρώτο πρόσωπο. Συγκεκριμένα γεγονότα. Χωρίς listicles, χωρίς «5 πράγματα που έμαθα». Μιλάω μόνο από ό,τι έζησα.',
    donts: 'Γενικές συμβουλές LinkedIn, elevator wisdom, Nobelle ως personal brand, Market Portal ως πώληση προϊόντος.',
    handle: '',
    pillars: BRAND_PILLARS.map((pillar) => pillar.id),
    excludedProjects: ['Nobelle'],
    lessonOnlyProjects: ['Market Portal'],
    projects: [],
  };
}

export function normalizeDna(raw, extras = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const empty = createEmptyDna();
  const pillars = Array.isArray(source.pillars) && source.pillars.length
    ? source.pillars.filter((id) => BRAND_PILLARS.some((pillar) => pillar.id === id))
    : empty.pillars;
  return {
    whoYouAre: String(source.whoYouAre || ''),
    standFor: String(source.standFor || ''),
    audience: String(source.audience || ''),
    voice: String(source.voice || empty.voice),
    donts: String(source.donts || empty.donts),
    handle: String(source.handle || extras.handle || ''),
    pillars,
    excludedProjects: Array.isArray(source.excludedProjects) && source.excludedProjects.length
      ? source.excludedProjects.map(String)
      : empty.excludedProjects,
    lessonOnlyProjects: Array.isArray(source.lessonOnlyProjects) && source.lessonOnlyProjects.length
      ? source.lessonOnlyProjects.map(String)
      : empty.lessonOnlyProjects,
    projects: Array.isArray(source.projects)
      ? source.projects.map((project) => ({
        id: String(project?.id || ''),
        title: String(project?.title || ''),
        phase: String(project?.phase || ''),
      })).filter((project) => project.title)
      : [],
  };
}

export function computeItemProgress(item = {}) {
  let score = 0;
  if (String(item.title || '').trim()) score += 18;
  if (String(item.hook || '').trim()) score += 18;
  if (String(item.body || '').trim().length >= 40) score += 28;
  if (String(item.body || '').trim().length >= 180) score += 12;
  if ((item.platforms || []).length) score += 12;
  if (item.variations && Object.keys(item.variations).length) score += 12;
  if (item.stage === 'ready' || item.stage === 'published') score = Math.max(score, 92);
  if (item.stage === 'published') score = 100;
  return Math.min(100, score);
}

export function normalizeBrandItem(raw = {}) {
  const stage = PIPELINE_STAGES.some((item) => item.id === raw.stage) ? raw.stage : 'idea';
  const kind = CAPTURE_KINDS.some((item) => item.id === raw.kind) ? raw.kind : 'thought';
  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.filter((id) => BRAND_PLATFORMS.some((platform) => platform.id === id))
    : [];
  const item = {
    id: raw.id || createBrandId('item'),
    stage,
    kind,
    title: String(raw.title || '').trim(),
    hook: String(raw.hook || ''),
    body: String(raw.body || ''),
    why: String(raw.why || ''),
    angle: String(raw.angle || ''),
    sourceLabel: String(raw.sourceLabel || raw.source_label || ''),
    sourceKind: String(raw.sourceKind || raw.source_kind || 'capture'),
    sourceId: raw.sourceId || raw.source_id || null,
    platforms,
    pillarId: BRAND_PILLARS.some((pillar) => pillar.id === raw.pillarId || pillar.id === raw.pillar_id)
      ? (raw.pillarId || raw.pillar_id)
      : null,
    progress: Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : 0,
    variations: raw.variations && typeof raw.variations === 'object' ? raw.variations : {},
    publishedAt: raw.publishedAt || raw.published_at || null,
    publishedUrl: raw.publishedUrl || raw.published_url || '',
    createdAt: raw.createdAt || raw.created_at || nowIso(),
    updatedAt: raw.updatedAt || raw.updated_at || nowIso(),
  };
  item.progress = computeItemProgress(item);
  return item;
}

export function createBrandItem(partial = {}) {
  return normalizeBrandItem({
    id: createBrandId('item'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...partial,
  });
}

export function isExcludedProject(title = '') {
  return EXCLUDED_BRAND_PROJECTS.test(title);
}

export function isLessonOnlyProject(title = '') {
  return LESSON_ONLY_PROJECTS.test(title);
}

export function isCoreBrandProject(title = '') {
  return CORE_BRAND_PROJECTS.test(title);
}

export function handleFromName(name = '') {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return slug ? `@${slug}` : '';
}

export function itemsByStage(items = []) {
  const map = {};
  for (const stage of PIPELINE_STAGES) map[stage.id] = [];
  for (const item of items) {
    const key = map[item.stage] ? item.stage : 'idea';
    map[key].push(item);
  }
  return map;
}

export function pillarLabel(id) {
  return BRAND_PILLARS.find((pillar) => pillar.id === id)?.label || id;
}

export function kindLabel(id) {
  return CAPTURE_KINDS.find((kind) => kind.id === id)?.label || id;
}

export function platformLabel(id) {
  return BRAND_PLATFORMS.find((platform) => platform.id === id)?.label || id;
}
