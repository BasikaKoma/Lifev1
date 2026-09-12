import { INK_COLUMNS } from '../../utils/projectSavePatch';

export const VAULT_META_FILE = 'vault.json';
export const VAULT_README_FILE = 'README.txt';
export const PROJECTS_DIR = 'projects';
export const PROJECT_INDEX_FILE = 'projects/_index.json';

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

export function sanitizeVaultId(id) {
  const value = String(id || '').trim();
  if (!SAFE_ID.test(value)) return null;
  return value;
}

export function projectDir(projectId) {
  const id = sanitizeVaultId(projectId);
  if (!id) throw new Error('Invalid project id for vault');
  return `${PROJECTS_DIR}/${id}`;
}

export function projectMetaPath(projectId) {
  return `${projectDir(projectId)}/meta.json`;
}

export function projectColumnPath(projectId, column) {
  return `${projectDir(projectId)}/${column}.json`;
}

export function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function encodeJson(column, value) {
  if (INK_COLUMNS.has(column)) return `${JSON.stringify(value)}\n`;
  return prettyJson(value);
}

export function nutritionPath() {
  return 'nutrition/bundle.json';
}

export function pathBundlePath() {
  return 'path/bundle.json';
}

export function brandPath() {
  return 'brand/bundle.json';
}

export function brainProfilePath() {
  return 'brain/profile.json';
}

export function brainMemoriesPath() {
  return 'brain/memories.json';
}

export function brainConversationsPath() {
  return 'brain/conversations.json';
}

export const VAULT_README = `Next Move — προσωπικός φάκελος
================================

Αυτά είναι τα δεδομένα σου σε αρχεία, όχι σε κρυφή βάση.

Μπορείς να βάλεις αυτόν τον φάκελο σε Syncthing, Dropbox ή iCloud
για να τα έχεις και σε άλλο υπολογιστή, χωρίς το cloud της εφαρμογής.

Μην μετονομάζεις τους φακέλους projects/ ενώ η εφαρμογή είναι ανοιχτή.
`;
