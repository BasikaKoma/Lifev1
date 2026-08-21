import { generateId } from '../data/templates';

export const EMPTY_PROJECT_BRIEF = {
  summary: '',
  purpose: '',
  audience: '',
  tagline: '',
  website: '',
  voice: '',
  colors: [],
  facts: [],
  agentInstructions: '',
};

export const SUGGESTED_COLOR_ROLES = [
  'Primary',
  'Secondary',
  'Accent',
  'Background',
  'Text',
];

function asText(value) {
  return typeof value === 'string' ? value : '';
}

export function normalizeHexColor(value, fallback = '#6366f1') {
  const raw = String(value || '').trim();
  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function createBriefColor(partial = {}) {
  return {
    id: partial.id || generateId(),
    name: asText(partial.name).trim() || 'Color',
    hex: normalizeHexColor(partial.hex),
  };
}

export function createBriefFact(partial = {}) {
  return {
    id: partial.id || generateId(),
    label: asText(partial.label).trim(),
    value: asText(partial.value).trim(),
  };
}

export function normalizeProjectBrief(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const colors = Array.isArray(source.colors)
    ? source.colors.map((color) => createBriefColor(color))
    : [];
  const facts = Array.isArray(source.facts)
    ? source.facts.map((fact) => createBriefFact(fact))
    : [];

  return {
    summary: asText(source.summary),
    purpose: asText(source.purpose),
    audience: asText(source.audience),
    tagline: asText(source.tagline),
    website: asText(source.website),
    voice: asText(source.voice),
    colors,
    facts,
    agentInstructions: asText(source.agentInstructions || source.agent_instructions),
  };
}

export function isProjectBriefEmpty(brief) {
  const data = normalizeProjectBrief(brief);
  return (
    !data.summary.trim()
    && !data.purpose.trim()
    && !data.audience.trim()
    && !data.tagline.trim()
    && !data.website.trim()
    && !data.voice.trim()
    && !data.agentInstructions.trim()
    && data.colors.length === 0
    && data.facts.every((fact) => !fact.label.trim() && !fact.value.trim())
  );
}

function pushSection(lines, title, value) {
  const text = asText(value).trim();
  if (!text) return;
  lines.push(`${title}: ${text}`);
}

export function formatProjectBriefForAgent({ title, brief } = {}) {
  const data = normalizeProjectBrief(brief);
  const lines = ['PROJECT BRIEF'];
  if (title?.trim()) lines.push(`Name: ${title.trim()}`);
  pushSection(lines, 'What it is', data.summary);
  pushSection(lines, 'What it does', data.purpose);
  pushSection(lines, 'Audience', data.audience);
  pushSection(lines, 'Tagline', data.tagline);
  pushSection(lines, 'Website', data.website);
  pushSection(lines, 'Voice / tone', data.voice);

  const colors = data.colors.filter((color) => color.name || color.hex);
  if (colors.length) {
    lines.push('Brand colors:');
    colors.forEach((color) => {
      lines.push(`- ${color.name || 'Color'}: ${color.hex}`);
    });
  }

  const facts = data.facts.filter((fact) => fact.label.trim() || fact.value.trim());
  if (facts.length) {
    lines.push('Extra facts:');
    facts.forEach((fact) => {
      const label = fact.label.trim() || 'Note';
      const value = fact.value.trim();
      lines.push(value ? `- ${label}: ${value}` : `- ${label}`);
    });
  }

  if (data.agentInstructions.trim()) {
    lines.push('Agent instructions:');
    lines.push(data.agentInstructions.trim());
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

function normalizeQuery(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function answerFromProjectBrief(text, { title, brief } = {}) {
  const data = normalizeProjectBrief(brief);
  const query = normalizeQuery(text);
  if (!query) return null;

  const wantsColors = /(?:χρωμα|color|palette|brand color)/.test(query);
  const wantsWhat = /(?:τι ειναι|what is|περιγραφ|describe|about this project|σχετικα με το project)/.test(query);
  const wantsPurpose = /(?:τι κανει|what does|σκοπο|purpose)/.test(query);
  const wantsAudience = /(?:κοινο|audience|πελατ)/.test(query);
  const wantsVoice = /(?:τονο|tone|φωνη|voice)/.test(query);
  const wantsInstructions = /(?:οδηγι|instruction|κανον)/.test(query);
  const wantsTagline = /(?:tagline|σλογκαν|slogan)/.test(query);
  const wantsBrief = /(?:brief|τα δεδομενα|project context)/.test(query);

  if (
    !wantsColors
    && !wantsWhat
    && !wantsPurpose
    && !wantsAudience
    && !wantsVoice
    && !wantsInstructions
    && !wantsTagline
    && !wantsBrief
  ) {
    return null;
  }

  if (isProjectBriefEmpty(data) && !title?.trim()) {
    return 'Δεν έχει συμπληρωθεί ακόμα brief για αυτό το project. Πήγαινε Settings → Project και γράψε τι είναι, τι κάνει και τις οδηγίες για τον agent.';
  }

  if (wantsColors) {
    if (!data.colors.length) {
      return 'Δεν έχουν οριστεί χρώματα στο brief. Πρόσθεσέ τα από Settings → Project.';
    }
    const list = data.colors.map((color) => `${color.name}: ${color.hex}`).join('\n');
    return `Χρώματα του project:\n${list}`;
  }

  if (wantsInstructions) {
    return data.agentInstructions.trim()
      ? `Οδηγίες agent:\n${data.agentInstructions.trim()}`
      : 'Δεν υπάρχουν ακόμα οδηγίες agent στο brief.';
  }

  if (wantsAudience) {
    return data.audience.trim()
      ? `Κοινό:\n${data.audience.trim()}`
      : 'Δεν έχει οριστεί κοινό στο brief.';
  }

  if (wantsVoice) {
    return data.voice.trim()
      ? `Τόνος / voice:\n${data.voice.trim()}`
      : 'Δεν έχει οριστεί τόνος στο brief.';
  }

  if (wantsTagline) {
    return data.tagline.trim()
      ? `Tagline:\n${data.tagline.trim()}`
      : 'Δεν έχει οριστεί tagline στο brief.';
  }

  if (wantsPurpose && !wantsWhat) {
    return data.purpose.trim()
      ? `Τι κάνει:\n${data.purpose.trim()}`
      : 'Δεν έχει γραφτεί ακόμα τι κάνει το project.';
  }

  const formatted = formatProjectBriefForAgent({ title, brief: data });
  return formatted
    ? formatted.replace('PROJECT BRIEF', 'Στοιχεία project')
    : 'Δεν έχει συμπληρωθεί ακόμα brief για αυτό το project.';
}
