const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadEnv } = require('./load-env.cjs');
const { getUpdateFeedUrl, getGitHubToken } = require('../electron/updateConfig.cjs');

loadEnv();

const RELEASE_DIR = path.join(os.homedir(), 'lifev1-release');
const GITHUB_API = 'https://api.github.com';

function collectReleaseFiles() {
  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(`Release folder not found: ${RELEASE_DIR}\nRun npm run electron:build first.`);
  }

  return fs
    .readdirSync(RELEASE_DIR)
    .filter(
      (name) =>
        name === 'latest.yml' ||
        (name.endsWith('.exe') && !name.endsWith('.blockmap')) ||
        name.endsWith('.exe.blockmap')
    )
    .map((name) => path.join(RELEASE_DIR, name));
}

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

async function getRepoMeta(owner, repo, token) {
  return githubJson(`/repos/${owner}/${repo}`, { token });
}

async function branchHasCommits(owner, repo, branch, token) {
  try {
    await githubJson(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token });
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

/** GitHub releases need at least one commit on the default branch. */
async function ensureRepoHasCommit(owner, repo, token) {
  const meta = await getRepoMeta(owner, repo, token);
  const branch = meta.default_branch || 'main';

  if (await branchHasCommits(owner, repo, branch, token)) {
    return branch;
  }

  console.log(`  • Initializing empty repo (${branch})…`);

  await githubJson(`/repos/${owner}/${repo}/contents/README.md`, {
    method: 'PUT',
    token,
    body: {
      message: 'Initialize lifev1 release channel',
      content: Buffer.from(
        '# lifev1 releases\n\nDesktop installer binaries are published here via GitHub Releases.\n'
      ).toString('base64'),
      branch,
    },
  });

  return branch;
}

async function getOrCreateRelease(owner, repo, tag, version, token) {
  try {
    return await githubJson(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
      token,
    });
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  const targetBranch = await ensureRepoHasCommit(owner, repo, token);

  return githubJson(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    token,
    body: {
      tag_name: tag,
      target_commitish: targetBranch,
      name: `lifev1 ${version}`,
      draft: false,
      prerelease: false,
      generate_release_notes: true,
    },
  });
}

async function deleteAsset(owner, repo, assetId, token) {
  await githubJson(`/repos/${owner}/${repo}/releases/assets/${assetId}`, {
    method: 'DELETE',
    token,
  });
}

async function uploadAsset(uploadUrl, filePath, token) {
  const name = path.basename(filePath);
  const body = fs.readFileSync(filePath);
  const endpoint = `${uploadUrl.replace(/\{.*$/, '')}?name=${encodeURIComponent(name)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: githubHeaders(token, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
    }),
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed for ${name}: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.name || name;
}

function patchLatestYml(ymlPath, nameMap) {
  let content = fs.readFileSync(ymlPath, 'utf8');
  for (const [localName, githubName] of nameMap) {
    if (localName !== githubName) {
      content = content.split(localName).join(githubName);
    }
  }
  fs.writeFileSync(ymlPath, content);
  return content;
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
    console.error('Missing GH_TOKEN (or GITHUB_TOKEN) in .env');
    console.error('Create one at GitHub → Settings → Developer settings → Personal access tokens (repo scope).');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const version = pkg.version;
  const tag = `v${version}`;

  const files = collectReleaseFiles();
  if (!files.some((filePath) => path.basename(filePath) === 'latest.yml')) {
    throw new Error('latest.yml not found in release folder. Build the installer first.');
  }

  console.log(`Publishing ${files.length} file(s) to GitHub ${owner}/${repo} (${tag})…`);

  const release = await getOrCreateRelease(owner, repo, tag, version, token);

  for (const asset of release.assets || []) {
    await deleteAsset(owner, repo, asset.id, token);
  }

  const ymlPath = files.find((filePath) => path.basename(filePath) === 'latest.yml');
  const binaryPaths = files.filter((filePath) => path.basename(filePath) !== 'latest.yml');
  const githubNames = new Map();

  for (const filePath of binaryPaths) {
    const localName = path.basename(filePath);
    const sizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);

    const githubName = await uploadAsset(release.upload_url, filePath, token);
    githubNames.set(localName, githubName);
    if (githubName !== localName) {
      console.log(`  ✓ ${localName} → ${githubName} (${sizeMb} MB)`);
    } else {
      console.log(`  ✓ ${localName} (${sizeMb} MB)`);
    }
  }

  if (ymlPath) {
    const localYmlName = path.basename(ymlPath);
    if (githubNames.size > 0) {
      patchLatestYml(ymlPath, githubNames);
    }

    await uploadAsset(release.upload_url, ymlPath, token);
    console.log(`  ✓ ${localYmlName} (patched for GitHub asset names)`);
  }

  console.log('\nPublished. Installed apps will pick this up on next update check.');
  console.log(`Feed URL: ${getUpdateFeedUrl()}`);
  console.log(`Release: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
