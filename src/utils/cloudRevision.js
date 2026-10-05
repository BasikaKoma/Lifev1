export function cloudConflictWarning(title) {
  const name = typeof title === 'string' && title.trim() ? `«${title.trim()}»` : 'Το project';
  return `${name}: η έκδοση στο cloud είναι νεότερη. Πάτα «Φόρτωση cloud» για να συγχρονίσεις.`;
}

export function readCloudVersion(row) {
  const raw = row?.version ?? row?.cloudVersion;
  if (raw == null || raw === '') return null;
  const version = Number(raw);
  return Number.isFinite(version) ? version : null;
}

/** True when two loaded revisions are the same write. Prefers integer version. */
export function revisionsMatch(local, remote) {
  if (!local || !remote) return false;
  const localVersion = local.cloudVersion ?? null;
  const remoteVersion = remote.cloudVersion ?? null;
  if (localVersion != null && remoteVersion != null) {
    return Number(localVersion) === Number(remoteVersion);
  }
  const localAt = local.cloudUpdatedAt || null;
  const remoteAt = remote.cloudUpdatedAt || null;
  return Boolean(localAt && remoteAt && localAt === remoteAt);
}

/**
 * Local IndexedDB meta still belongs to the cloud row we just loaded.
 * Missing local stamp means there is nothing newer to conflict with.
 */
export function localMetaMatchesCloud(meta, projectState) {
  if (!meta) return true;
  const metaVersion = meta.cloudVersion ?? null;
  const stateVersion = projectState?.cloudVersion ?? null;
  if (metaVersion != null && stateVersion != null) {
    return Number(metaVersion) === Number(stateVersion);
  }
  if (!meta.cloudUpdatedAt) return true;
  return meta.cloudUpdatedAt === projectState?.cloudUpdatedAt;
}
