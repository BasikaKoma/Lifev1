import { getDayEntry } from '../../utils/lifelineDays';
import { getSelfHubDayEntry } from '../../utils/selfHubDays';
import { visibleThoughts } from '../../utils/dayThoughts';

const MAX_BEATS = 24;

export const NARRATIVE_THREADS = [
  {
    id: 'symphon-building',
    title: 'Δημιουργία του Symphon',
    story: 'Χτίσιμο του ERP από πραγματικά προβλήματα — όχι από θεωρία προϊόντος.',
    pillarId: 'building',
    keywords: [
      { re: /symphon/, weight: 3 },
      { re: /\berp\b/, weight: 2 },
      { re: /τιμολογ|παραστατικ|αποθηκ|λογιστικ/, weight: 2 },
      { re: /lifev1|life v1/, weight: 1 },
    ],
  },
  {
    id: 'first-customers',
    title: 'Πρώτοι πελάτες',
    story: 'Οι πρώτες πραγματικές σχέσεις με πελάτες: τι ζήτησαν, τι κόλλησε, τι έκλεισε.',
    pillarId: 'entrepreneurship',
    keywords: [
      { re: /πελατ/, weight: 3 },
      { re: /customer|\bclient/, weight: 2 },
      { re: /εκλεισα|υπεγραψ|closed\s?won/, weight: 2 },
      { re: /πρωτ(η|ο|οι)\s+(συναντηση|demo|πελατ)/, weight: 2 },
      { re: /ραντεβου|προσφορα|\bdeal\b/, weight: 1 },
    ],
  },
  {
    id: 'vibecoding-doubt',
    title: 'Αμφιβολία γύρω από το vibecoding',
    story: 'Να χτίζεις με AI χωρίς να είσαι σίγουρος αν αυτό μετράει ως πραγματική δημιουργία.',
    pillarId: 'ai',
    keywords: [
      { re: /vibecod|vibe.?cod/, weight: 3 },
      { re: /\bcursor\b/, weight: 2 },
      { re: /δεν ειμαι (πραγματικος )?(developer|προγραμματιστ)/, weight: 3 },
      { re: /γραφει κωδικα|ai.?code|chatgpt|claude/, weight: 2 },
      { re: /αμφιβολ.+(κωδικ|ai|developer|χτιζ)/, weight: 2 },
    ],
  },
  {
    id: 'market-portal-to-systems',
    title: 'Από Market Portal σε συστήματα',
    story: 'Η μετάβαση από το Market Portal ως μάθημα, προς δημιουργία συστημάτων.',
    pillarId: 'decisions',
    keywords: [
      { re: /market\s*portal|marketportal/, weight: 3 },
      { re: /μεταβασ.+συστημ|συστηματ.+μεταβασ/, weight: 2 },
      { re: /\bpivot\b|αλλαξα πορεια/, weight: 2 },
    ],
  },
  {
    id: 'exposure-first-video',
    title: 'Δυσκολία έκθεσης και πρώτο βίντεο',
    story: 'Ο φόβος να φανείς και η στιγμή του πρώτου βίντεο ή reel.',
    pillarId: 'decisions',
    keywords: [
      { re: /βιντεο|\bvideo\b|\breel\b|καμερα/, weight: 3 },
      { re: /εκθεσ|exposure|δημοσια/, weight: 2 },
      { re: /φοβαμαι να (μιλησω|φανω)|δυσκολευομαι να φανω/, weight: 3 },
      { re: /πρωτο (βιντεο|video|reel)/, weight: 3 },
    ],
  },
  {
    id: 'business-and-life',
    title: 'Επιχειρηματικότητα και κατανόηση της ζωής',
    story: 'Πώς η δουλειά και η αυτογνωσία είναι η ίδια άσκηση, όχι δύο ζωές.',
    pillarId: 'self',
    keywords: [
      { re: /lifeeffect/, weight: 2 },
      { re: /αυτογνωσ/, weight: 2 },
      { re: /διαλογισ/, weight: 2 },
      { re: /συνειδησ/, weight: 2 },
      { re: /αμνησι/, weight: 3 },
      { re: /εμπειρι/, weight: 2 },
      { re: /νοημα|υπαρξ|περιεργ/, weight: 2 },
      { re: /τι ειμαι|τι ειναι (εδω|εγω)|ηρθαμε εδω/, weight: 3 },
      { re: /\bζωη\b/, weight: 1 },
    ],
  },
];

export function foldBrandText(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    .toLowerCase();
}

function compact(text, max = 140) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function scoreThread(thread, blob) {
  let score = 0;
  for (const keyword of thread.keywords || []) {
    const re = keyword.re || keyword;
    const weight = Number(keyword.weight) || 1;
    if (re.test(blob)) score += weight;
  }
  return score;
}

export function matchNarrativeThread(text = '') {
  const blob = foldBrandText(text);
  if (!blob.trim()) return null;
  let best = null;
  let bestScore = 0;
  for (const thread of NARRATIVE_THREADS) {
    const score = scoreThread(thread, blob);
    if (score > bestScore) {
      best = thread;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function threadById(id) {
  return NARRATIVE_THREADS.find((thread) => thread.id === id) || null;
}

export function threadTitle(id) {
  return threadById(id)?.title || '';
}

export function isNarrativeThreadId(id) {
  return NARRATIVE_THREADS.some((thread) => thread.id === id);
}

export function normalizeThreadBeat(raw = {}) {
  const summary = compact(raw.summary || raw.what || raw.title || '', 160);
  if (!summary) return null;
  return {
    id: String(raw.id || `${raw.sourceKind || 'beat'}:${raw.sourceId || summary.slice(0, 24)}`),
    date: String(raw.date || '').slice(0, 10),
    summary,
    sourceKind: String(raw.sourceKind || 'memory'),
    sourceId: raw.sourceId || null,
    stage: raw.stage || null,
  };
}

export function createEmptyThread(seed) {
  const base = threadById(seed?.id) || seed || {};
  return {
    id: base.id,
    title: base.title || '',
    story: base.story || '',
    pillarId: base.pillarId || null,
    beats: [],
    itemIds: [],
    lastSeenAt: null,
  };
}

export function normalizeNarrativeThreads(raw) {
  const byId = new Map();
  for (const seed of NARRATIVE_THREADS) {
    byId.set(seed.id, createEmptyThread(seed));
  }
  const source = Array.isArray(raw) ? raw : [];
  for (const row of source) {
    if (!row?.id || !byId.has(row.id)) continue;
    const current = byId.get(row.id);
    const beats = (Array.isArray(row.beats) ? row.beats : [])
      .map(normalizeThreadBeat)
      .filter(Boolean);
    const seen = new Set();
    const unique = [];
    for (const beat of beats) {
      if (seen.has(beat.id)) continue;
      seen.add(beat.id);
      unique.push(beat);
    }
    byId.set(row.id, {
      ...current,
      beats: unique
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, MAX_BEATS),
      itemIds: Array.isArray(row.itemIds) ? row.itemIds.map(String) : [],
      lastSeenAt: row.lastSeenAt || unique[0]?.date || null,
    });
  }
  return NARRATIVE_THREADS.map((seed) => byId.get(seed.id));
}

function addBeat(thread, beat) {
  const next = normalizeThreadBeat(beat);
  if (!next) return thread;
  if (thread.beats.some((row) => row.id === next.id)) return thread;
  const beats = [next, ...thread.beats]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_BEATS);
  const itemIds = next.stage
    ? [...new Set([next.sourceId, ...thread.itemIds].filter(Boolean))]
    : thread.itemIds;
  return {
    ...thread,
    beats,
    itemIds,
    lastSeenAt: beats[0]?.date || thread.lastSeenAt,
  };
}

function matchBlob(parts) {
  return matchNarrativeThread(parts.filter(Boolean).join(' '));
}

export function attachThreadToFragment(fragment = {}) {
  const match = matchBlob([
    fragment.title,
    fragment.what,
    fragment.body,
    fragment.sourceLabel,
    fragment.context,
    fragment.angle,
  ]);
  if (!match) return fragment;
  return {
    ...fragment,
    threadId: fragment.threadId || match.id,
    threadTitle: fragment.threadTitle || match.title,
  };
}

export function harvestNarrativeMemory({
  storedThreads = [],
  items = [],
  signals = [],
  lifelineDays = {},
  selfHubDays = {},
} = {}) {
  let threads = normalizeNarrativeThreads(storedThreads);
  const index = new Map(threads.map((thread) => [thread.id, thread]));

  const push = (threadId, beat) => {
    const current = index.get(threadId);
    if (!current) return;
    index.set(threadId, addBeat(current, beat));
  };

  for (const item of items || []) {
    const tagged = attachThreadToFragment(item);
    if (!tagged.threadId) continue;
    push(tagged.threadId, {
      id: `item:${item.id}`,
      date: String(item.createdAt || item.updatedAt || '').slice(0, 10),
      summary: item.title || item.body,
      sourceKind: 'item',
      sourceId: item.id,
      stage: item.stage,
    });
  }

  for (const signal of signals || []) {
    const tagged = attachThreadToFragment(signal);
    if (!tagged.threadId) continue;
    push(tagged.threadId, {
      id: `signal:${signal.id}`,
      date: signal.date || '',
      summary: signal.what || signal.title,
      sourceKind: signal.sourceKind || 'signal',
      sourceId: signal.id,
    });
  }

  const dates = [...new Set([
    ...Object.keys(lifelineDays || {}),
    ...Object.keys(selfHubDays || {}),
  ])].sort().reverse();

  for (const date of dates) {
    const day = getDayEntry(lifelineDays, date);
    const hub = getSelfHubDayEntry(selfHubDays, date);
    const notes = compact(day.notes || hub.journal?.notes, 220);
    if (notes) {
      const match = matchBlob([notes]);
      if (match) {
        push(match.id, {
          id: `notes:${date}`,
          date,
          summary: notes,
          sourceKind: 'lifeline',
          sourceId: `lifeline:${date}:notes`,
        });
      }
    }
    for (const thought of visibleThoughts(day.thoughts)) {
      const text = compact(thought.text, 220);
      if (!text) continue;
      const match = matchBlob([text, thought.pathBlockTitle]);
      if (!match) continue;
      push(match.id, {
        id: `thought:${thought.id}`,
        date,
        summary: text,
        sourceKind: 'thought',
        sourceId: thought.id,
      });
    }
  }

  threads = NARRATIVE_THREADS.map((seed) => index.get(seed.id));
  return threads;
}

export function threadsBlock(threads = [], threadId = null) {
  const list = threadId
    ? (threads || []).filter((thread) => thread.id === threadId)
    : (threads || []).filter((thread) => (thread.beats || []).length);
  if (!list.length) return 'NARRATIVE THREADS: none of the long-term stories matched this fragment yet.';
  return [
    'NARRATIVE THREADS (long-term stories — this post is a chapter, not a one-off)',
    ...list.map((thread) => {
      const beats = (thread.beats || []).slice(0, 6).map((beat) => `- ${beat.date || '—'} ${beat.summary}`).join('\n');
      return [`${thread.title}: ${thread.story}`, beats].filter(Boolean).join('\n');
    }),
  ].join('\n');
}

export function activeThreads(threads = []) {
  return (threads || [])
    .filter((thread) => (thread.beats || []).length)
    .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
}

export function mergeNarrativeThreads(cloud = [], local = []) {
  const harvested = harvestNarrativeMemory({
    storedThreads: [...normalizeNarrativeThreads(cloud), ...normalizeNarrativeThreads(local)],
  });
  return harvested;
}
