let liveProjectSource = async () => [];

export function registerVaultProjectSource(fn) {
  liveProjectSource = typeof fn === 'function' ? fn : async () => [];
}

export async function getLiveVaultProjects() {
  try {
    const rows = await liveProjectSource();
    return Array.isArray(rows) ? rows.filter((row) => row?.projectId) : [];
  } catch {
    return [];
  }
}
