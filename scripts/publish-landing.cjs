const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./load-env.cjs');
const { getGitHubToken } = require('../electron/updateConfig.cjs');

loadEnv();

const GITHUB_API = 'https://api.github.com';
const LANDING_DIR = path.join(__dirname, '..', 'landing');

function githubHeaders(token, extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function githubJson(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${GITHUB_API}${pathname}`, {
    method,
    headers: githubHeaders(token, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail = typeof data?.message === 'string' ? data.message : text;
    const err = new Error(`GitHub API ${pathname}: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

async function getDefaultBranch(owner, repo, token) {
  const meta = await githubJson(`/repos/${owner}/${repo}`, { token });
  return meta.default_branch || 'main';
}

function collectLandingFiles(dir = LANDING_DIR, base = LANDING_DIR) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Landing folder not found: ${dir}`);
  }

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectLandingFiles(fullPath, base));
      continue;
    }
    files.push({
      localPath: fullPath,
      repoPath: path.relative(base, fullPath).split(path.sep).join('/'),
    });
  }
  return files;
}

async function getExistingSha(owner, repo, branch, repoPath, token) {
  try {
    const data = await githubJson(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(repoPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`,
      { token }
    );
    return data.sha || null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function upsertFile(owner, repo, branch, repoPath, localPath, token) {
  const sha = await getExistingSha(owner, repo, branch, repoPath, token);
  const content = fs.readFileSync(localPath);

  await githubJson(`/repos/${owner}/${repo}/contents/${repoPath}`, {
    method: 'PUT',
    token,
    body: {
      message: sha ? `Update ${repoPath}` : `Add ${repoPath}`,
      content: content.toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    },
  });
}

async function main() {
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  const token = getGitHubToken();

  if (!owner || !repo) {
    console.error('Missing GITHUB_OWNER and GITHUB_REPO in .env');
    process.exit(1);
  }
  if (!token) {
    console.error('Missing GH_TOKEN in .env');
    process.exit(1);
  }

  const branch = await getDefaultBranch(owner, repo, token);
  const { execSync } = require('child_process');
  execSync('node scripts/generate-landing-config.cjs', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });

  const files = collectLandingFiles();

  console.log(`Uploading ${files.length} landing file(s) to ${owner}/${repo} (${branch})…`);

  for (const file of files) {
    const repoPath = `landing/${file.repoPath}`;
    await upsertFile(owner, repo, branch, repoPath, file.localPath, token);
    console.log(`  ✓ ${repoPath}`);
  }

  console.log('\nLanding files pushed to GitHub.');
  console.log('Retry the Cloudflare Pages deployment (or wait for auto-deploy).');
  console.log(`Repo: https://github.com/${owner}/${repo}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
