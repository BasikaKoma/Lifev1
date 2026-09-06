const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
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
    'User-Agent': 'lifev1-publish',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function formatFetchError(err) {
  const parts = [err.message || String(err)];
  if (err.cause) {
    const cause = err.cause;
    parts.push(cause.code || cause.errno || cause.message || String(cause));
  }
  return parts.join(' — ');
}

async function withRetries(label, fn, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket|network|502|503|504/i.test(
          `${err.message} ${err.cause?.code || ''} ${err.cause?.message || ''} ${err.status || ''}`
        );
      if (!retryable || i === attempts) throw err;
      const waitMs = 2000 * i;
      console.warn(`  ⚠ ${label} failed (${formatFetchError(err)}). Retry ${i}/${attempts - 1} in ${waitMs / 1000}s…`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastErr;
}

async function githubJson(pathname, { method = 'GET', token, body } = {}) {
  const res = await withRetries(`GitHub ${method} ${pathname}`, () =>
    fetch(`${GITHUB_API}${pathname}`, {
      method,
      headers: githubHeaders(token, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    })
  );

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
  const size = fs.statSync(filePath).size;
  const endpoint = `${uploadUrl.replace(/\{.*$/, '')}?name=${encodeURIComponent(name)}`;

  const data = await withRetries(`upload ${name}`, () =>
    new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const req = https.request(
        {
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: githubHeaders(token, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(size),
          }),
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode < 200 || res.statusCode >= 300) {
              const err = new Error(`Upload failed for ${name}: ${res.statusCode} ${text}`);
              err.status = res.statusCode;
              reject(err);
              return;
            }
            try {
              resolve(JSON.parse(text));
            } catch (parseErr) {
              reject(parseErr);
            }
          });
        }
      );
      req.on('error', reject);
      fs.createReadStream(filePath).pipe(req);
    })
  );

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
  const existing = new Map((release.assets || []).map((asset) => [asset.name, asset]));

  const ymlPath = files.find((filePath) => path.basename(filePath) === 'latest.yml');
  const binaryPaths = files.filter((filePath) => path.basename(filePath) !== 'latest.yml');
  const githubNames = new Map();

  for (const filePath of binaryPaths) {
    const localName = path.basename(filePath);
    const size = fs.statSync(filePath).size;
    const sizeMb = (size / (1024 * 1024)).toFixed(1);
    const current = existing.get(localName);

    if (current && current.size === size) {
      githubNames.set(localName, current.name);
      console.log(`  • ${localName} already on GitHub (${sizeMb} MB)`);
      continue;
    }

    if (current) {
      await deleteAsset(owner, repo, current.id, token);
      existing.delete(localName);
    }

    const githubName = await uploadAsset(release.upload_url, filePath, token);
    githubNames.set(localName, githubName);
    existing.set(githubName, { name: githubName, size });
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

    const ymlSize = fs.statSync(ymlPath).size;
    const currentYml = existing.get(localYmlName);
    if (currentYml && currentYml.size === ymlSize) {
      console.log(`  • ${localYmlName} already on GitHub`);
    } else {
      if (currentYml) {
        await deleteAsset(owner, repo, currentYml.id, token);
      }
      await uploadAsset(release.upload_url, ymlPath, token);
      console.log(`  ✓ ${localYmlName} (patched for GitHub asset names)`);
    }
  }

  console.log('\nPublished. Installed apps will pick this up on next update check.');
  console.log(`Feed URL: ${getUpdateFeedUrl()}`);
  console.log(`Release: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
}

main().catch((err) => {
  console.error(formatFetchError(err));
  process.exit(1);
});
