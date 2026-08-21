/** GitHub Releases host the installer (Supabase free tier caps uploads at 50 MB). */

function tryGetUpdateFeedUrl() {
  const override =
    process.env.LIFEV1_UPDATE_URL?.trim() || process.env.NEXT_MOVE_UPDATE_URL?.trim();
  if (override) return override.replace(/\/$/, '');

  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  if (owner && repo) {
    return `https://github.com/${owner}/${repo}/releases/latest/download`;
  }

  return null;
}

function getUpdateFeedUrl() {
  const url = tryGetUpdateFeedUrl();
  if (url) return url;

  throw new Error(
    [
      'Missing GITHUB_OWNER and GITHUB_REPO in .env.',
      'Add them, then run npm run electron:publish',
      '(Installers are too large for Supabase free storage — 50 MB limit.)',
    ].join(' ')
  );
}

function getGitHubToken() {
  return process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || '';
}

module.exports = {
  tryGetUpdateFeedUrl,
  getUpdateFeedUrl,
  getGitHubToken,
};
