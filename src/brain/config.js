import { platform } from '../platform';

const CONFIG_KEY = 'lifev1-brain-provider';

export const BRAIN_LEVELS = [
  {
    id: 'standard',
    label: 'Standard',
    productName: 'GPT-5.6 Terra',
    description: 'Καθημερινή χρήση, συζήτηση και δημιουργία περιεχομένου.',
  },
  {
    id: 'deepThink',
    label: 'Deep Think',
    productName: 'GPT-5.6 Sol',
    description: 'Στρατηγική και δύσκολες αποφάσεις.',
  },
  {
    id: 'economy',
    label: 'Economy',
    productName: 'GPT-5.6 Luna',
    description: 'Απλές εργασίες και περιλήψεις.',
  },
];

export const DEFAULT_OPENAI_LEVEL_MODELS = {
  standard: 'gpt-5.6-terra',
  deepThink: 'gpt-5.6-sol',
  economy: 'gpt-5.6-luna',
};

export const DEFAULT_BRAIN_CONFIG = {
  providerId: 'openai',
  level: 'standard',
  model: '',
  openaiLevelModels: { ...DEFAULT_OPENAI_LEVEL_MODELS },
  localBaseUrl: 'http://127.0.0.1:11434/v1',
  customBaseUrl: '',
};

function normalizeLevel(value) {
  return BRAIN_LEVELS.some((level) => level.id === value) ? value : 'standard';
}

function normalizeLevelModels(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    standard: String(source.standard || DEFAULT_OPENAI_LEVEL_MODELS.standard).trim() || DEFAULT_OPENAI_LEVEL_MODELS.standard,
    deepThink: String(source.deepThink || DEFAULT_OPENAI_LEVEL_MODELS.deepThink).trim() || DEFAULT_OPENAI_LEVEL_MODELS.deepThink,
    economy: String(source.economy || DEFAULT_OPENAI_LEVEL_MODELS.economy).trim() || DEFAULT_OPENAI_LEVEL_MODELS.economy,
  };
}

export function normalizeBrainConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const providerId = ['openai', 'local', 'custom'].includes(source.providerId)
    ? source.providerId
    : 'openai';
  return {
    providerId,
    level: normalizeLevel(source.level),
    model: typeof source.model === 'string' ? source.model.trim() : '',
    openaiLevelModels: normalizeLevelModels(source.openaiLevelModels),
    localBaseUrl: typeof source.localBaseUrl === 'string' && source.localBaseUrl.trim()
      ? source.localBaseUrl.trim().replace(/\/+$/, '')
      : DEFAULT_BRAIN_CONFIG.localBaseUrl,
    customBaseUrl: typeof source.customBaseUrl === 'string'
      ? source.customBaseUrl.trim().replace(/\/+$/, '')
      : '',
  };
}

export function loadBrainConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return normalizeBrainConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeBrainConfig(null);
  }
}

export function saveBrainConfig(config) {
  const next = normalizeBrainConfig(config);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function getBrainLevelMeta(levelId) {
  return BRAIN_LEVELS.find((level) => level.id === levelId) || BRAIN_LEVELS[0];
}

export function resolveBrainModel(config) {
  const normalized = normalizeBrainConfig(config);
  if (normalized.providerId === 'openai') {
    return normalized.openaiLevelModels[normalized.level] || DEFAULT_OPENAI_LEVEL_MODELS.standard;
  }
  return normalized.model;
}

export function formatActiveBrainLabel(config) {
  const normalized = normalizeBrainConfig(config);
  if (normalized.providerId === 'openai') {
    const meta = getBrainLevelMeta(normalized.level);
    return `${meta.label} · ${meta.productName}`;
  }
  return normalized.model || (normalized.providerId === 'custom' ? 'Custom model' : 'Local model');
}

export function getProviderDestination(config) {
  return config.providerId === 'openai' ? 'cloud' : 'local';
}

export function isLoopbackUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

export function getResolvedEndpoint(config) {
  if (config.providerId === 'openai') {
    return { kind: 'openai-responses', baseUrl: 'https://api.openai.com/v1' };
  }
  if (config.providerId === 'local') {
    return { kind: 'openai-compatible', baseUrl: config.localBaseUrl };
  }
  return { kind: 'openai-compatible', baseUrl: config.customBaseUrl };
}

export function assertLocalEndpointAllowed(config) {
  if (config.providerId === 'openai') return;
  const { baseUrl } = getResolvedEndpoint(config);
  if (!baseUrl) {
    throw new Error('Βάλε ένα local / custom endpoint στις ρυθμίσεις του Brain.');
  }
  if (isLoopbackUrl(baseUrl) && !platform.isElectron) {
    throw new Error('Το 127.0.0.1 δουλεύει μόνο στο desktop. Στο web/Android βάλε ρητό LAN/custom URL.');
  }
}

export function getProviderCapabilities(config) {
  if (config.providerId === 'openai') {
    return {
      destination: 'cloud',
      supportsTools: true,
      supportsVision: true,
      supportsStructuredOutput: true,
    };
  }
  return {
    destination: 'local',
    supportsTools: true,
    supportsVision: Boolean(resolveBrainModel(config)),
    supportsStructuredOutput: false,
  };
}
