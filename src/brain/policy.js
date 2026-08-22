const POLICY_KEY = 'lifev1-brain-policy';

export const DEFAULT_BRAIN_POLICY = {
  appScopes: {
    self: true,
    lifeline: true,
    brand: true,
    projects: true,
    notes: true,
  },
  tools: {
    listDir: true,
    readFile: true,
    readImage: true,
  },
  roots: [],
  cloudMaySeeAppData: true,
  cloudMaySeeLocalFiles: false,
};

function asBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeBrainPolicy(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const scopes = source.appScopes && typeof source.appScopes === 'object' ? source.appScopes : {};
  const tools = source.tools && typeof source.tools === 'object' ? source.tools : {};
  const roots = Array.isArray(source.roots)
    ? source.roots
      .filter((root) => root && typeof root.rootId === 'string')
      .map((root) => ({
        rootId: root.rootId,
        displayName: String(root.displayName || 'Folder'),
      }))
    : [];

  return {
    appScopes: {
      self: asBool(scopes.self, true),
      lifeline: asBool(scopes.lifeline, true),
      brand: asBool(scopes.brand, true),
      projects: asBool(scopes.projects, true),
      notes: asBool(scopes.notes, true),
    },
    tools: {
      listDir: asBool(tools.listDir, true),
      readFile: asBool(tools.readFile, true),
      readImage: asBool(tools.readImage, true),
    },
    roots,
    cloudMaySeeAppData: asBool(source.cloudMaySeeAppData, true),
    cloudMaySeeLocalFiles: asBool(source.cloudMaySeeLocalFiles, false),
  };
}

const APP_ACCESS_MIGRATION = 'lifev1-brain-app-access-v1';
const LOCAL_FILES_MIGRATION = 'lifev1-brain-local-files-v1';
const ADVISOR_SCOPES_MIGRATION = 'lifev1-brain-advisor-scopes-v1';

export function loadBrainPolicy() {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    let policy = normalizeBrainPolicy(raw ? JSON.parse(raw) : null);
    if (!localStorage.getItem(APP_ACCESS_MIGRATION)) {
      policy = { ...policy, cloudMaySeeAppData: true };
      localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
      localStorage.setItem(APP_ACCESS_MIGRATION, '1');
    }
    if (!localStorage.getItem(ADVISOR_SCOPES_MIGRATION)) {
      policy = {
        ...policy,
        cloudMaySeeAppData: true,
        appScopes: {
          self: true,
          lifeline: true,
          brand: true,
          projects: true,
          notes: true,
        },
      };
      localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
      localStorage.setItem(ADVISOR_SCOPES_MIGRATION, '1');
    }
    if (!localStorage.getItem(LOCAL_FILES_MIGRATION) && (policy.roots || []).length > 0) {
      policy = { ...policy, cloudMaySeeLocalFiles: true };
      localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
      localStorage.setItem(LOCAL_FILES_MIGRATION, '1');
    }
    return policy;
  } catch {
    return normalizeBrainPolicy(null);
  }
}

export function saveBrainPolicy(policy) {
  const next = normalizeBrainPolicy(policy);
  localStorage.setItem(POLICY_KEY, JSON.stringify(next));
  return next;
}

export function canCloudSeeAppData(policy, destination) {
  if (destination !== 'cloud') return true;
  return policy.cloudMaySeeAppData === true;
}

export function canCloudSeeLocalFiles(policy, destination) {
  if ((policy.roots || []).length > 0) return true;
  if (destination !== 'cloud') return true;
  return policy.cloudMaySeeLocalFiles === true;
}
