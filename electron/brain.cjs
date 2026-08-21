const { app, dialog, ipcMain, safeStorage, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEXT_MAX = 200 * 1024;
const IMAGE_MAX = 4 * 1024 * 1024;
const ALLOWED_TEXT = new Set(['.txt', '.md', '.json', '.csv']);
const ALLOWED_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function secretsPath() {
  return path.join(app.getPath('userData'), 'brain-secrets.json');
}

function rootsPath() {
  return path.join(app.getPath('userData'), 'brain-roots.json');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadRoots() {
  const raw = readJson(rootsPath(), {});
  return raw && typeof raw === 'object' ? raw : {};
}

function saveRoots(roots) {
  writeJson(rootsPath(), roots);
}

function getCloudKey() {
  const stored = readJson(secretsPath(), {});
  if (!stored.openaiKey) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored.openaiKey, 'base64'));
  } catch {
    return null;
  }
}

function setCloudKey(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS key encryption is not available.');
  }
  const trimmed = String(key || '').trim();
  if (!trimmed) throw new Error('Empty key');
  writeJson(secretsPath(), {
    openaiKey: safeStorage.encryptString(trimmed).toString('base64'),
  });
  return { configured: true };
}

function clearCloudKey() {
  writeJson(secretsPath(), {});
  return { configured: false };
}

function resolveSafePath(rootId, relativePath = '') {
  const roots = loadRoots();
  const root = roots[rootId];
  if (!root?.path) throw new Error('Unknown folder');

  const rootReal = fs.realpathSync(root.path);
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (path.isAbsolute(rel) || rel.split('/').some((part) => part === '..')) {
    throw new Error('Invalid path');
  }

  const joined = rel ? path.resolve(rootReal, rel) : rootReal;
  const targetReal = fs.realpathSync(joined);
  const prefix = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
  if (targetReal !== rootReal && !targetReal.startsWith(prefix)) {
    throw new Error('Path escapes allowlist');
  }
  return { targetReal, displayRel: rel, displayName: root.displayName };
}

function publicRoots() {
  return Object.entries(loadRoots()).map(([rootId, value]) => ({
    rootId,
    displayName: value.displayName || 'Folder',
  }));
}

async function pickFolder(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win || undefined, {
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const chosen = fs.realpathSync(result.filePaths[0]);
  const roots = loadRoots();
  const existing = Object.entries(roots).find(([, value]) => value.path === chosen);
  if (existing) {
    return { rootId: existing[0], displayName: existing[1].displayName };
  }
  const rootId = `root-${crypto.randomBytes(4).toString('hex')}`;
  const displayName = path.basename(chosen) || 'Folder';
  roots[rootId] = { path: chosen, displayName };
  saveRoots(roots);
  return { rootId, displayName };
}

function listDir(rootId, relativePath = '') {
  const { targetReal } = resolveSafePath(rootId, relativePath);
  const entries = fs.readdirSync(targetReal, { withFileTypes: true });
  return entries.slice(0, 200).map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? 'dir' : 'file',
    relativePath: [relativePath, entry.name].filter(Boolean).join('/').replace(/\\/g, '/'),
  }));
}

function readText(rootId, relativePath) {
  const { targetReal } = resolveSafePath(rootId, relativePath);
  const ext = path.extname(targetReal).toLowerCase();
  if (!ALLOWED_TEXT.has(ext)) throw new Error('File type not allowed');
  const stat = fs.statSync(targetReal);
  if (!stat.isFile()) throw new Error('Not a file');
  if (stat.size > TEXT_MAX) throw new Error('File too large');
  return {
    name: path.basename(targetReal),
    sourceId: `file:${rootId}/${String(relativePath || '').replace(/\\/g, '/')}`,
    text: fs.readFileSync(targetReal, 'utf8'),
  };
}

function readImage(rootId, relativePath) {
  const { targetReal } = resolveSafePath(rootId, relativePath);
  const ext = path.extname(targetReal).toLowerCase();
  if (!ALLOWED_IMAGE.has(ext)) throw new Error('Image type not allowed');
  const stat = fs.statSync(targetReal);
  if (!stat.isFile()) throw new Error('Not a file');
  if (stat.size > IMAGE_MAX) throw new Error('Image too large');
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const base64 = fs.readFileSync(targetReal).toString('base64');
  return {
    name: path.basename(targetReal),
    sourceId: `file:${rootId}/${String(relativePath || '').replace(/\\/g, '/')}`,
    kind: 'image',
    mime,
    dataUrl: `data:${mime};base64,${base64}`,
  };
}

function buildResponsesInput(input, attachments) {
  const content = [{ type: 'input_text', text: String(input || '') }];
  for (const file of attachments || []) {
    if (file?.kind === 'image' && file.dataUrl) {
      content.push({ type: 'input_image', image_url: file.dataUrl });
    } else if (file?.text) {
      content.push({ type: 'input_text', text: `\n\nFILE ${file.name || ''}\n${file.text}` });
    }
  }
  return [{ role: 'user', content }];
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseResponsesResult(data) {
  const toolCalls = [];
  const texts = [];
  for (const item of data.output || []) {
    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id || item.id,
        name: item.name,
        arguments: parseJson(item.arguments),
      });
    }
    if (item.type === 'message') {
      for (const part of item.content || []) {
        if (part.type === 'output_text' && part.text) texts.push(part.text);
      }
    }
  }
  const text = texts.join('\n').trim() || data.output_text || '';
  return { text, toolCalls, parsed: parseJson(text) };
}

async function runOpenAIResponses({ apiKey, model, input, instructions, tools, outputSchema, attachments }) {
  if (!apiKey) throw new Error('Missing OpenAI API key. Add it in Brain Expand settings.');
  if (!model) throw new Error('Set a model in Brain settings.');

  const body = {
    model,
    store: false,
    instructions: instructions || undefined,
    input: buildResponsesInput(input, attachments),
  };
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
  if (outputSchema) {
    body.text = {
      format: {
        type: 'json_schema',
        name: 'brain_insights',
        strict: true,
        schema: outputSchema,
      },
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI Responses error ${response.status}`);
  }
  return parseResponsesResult(data);
}

async function runOpenAICompatible({ baseUrl, apiKey, model, input, instructions, tools, outputSchema, attachments }) {
  if (!baseUrl) throw new Error('Missing local/custom endpoint.');
  if (!model) throw new Error('Set a model in Brain settings.');

  const messages = [
    instructions ? { role: 'system', content: instructions } : null,
    {
      role: 'user',
      content: [
        String(input || ''),
        ...(attachments || []).map((file) => (file?.text ? `\n\nFILE ${file.name || ''}\n${file.text}` : '')),
      ].join(''),
    },
  ].filter(Boolean);

  if (outputSchema) {
    messages[0] = {
      role: 'system',
      content: `${instructions || ''}\n\nReturn ONLY JSON matching this schema:\n${JSON.stringify(outputSchema)}`.trim(),
    };
  }

  const body = { model, temperature: 0.2, messages };
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
  if (outputSchema) body.response_format = { type: 'json_object' };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Local model error ${response.status}`);
  }
  const message = data?.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((call) => ({
    id: call.id,
    name: call.function?.name,
    arguments: parseJson(call.function?.arguments),
  }));
  const text = String(message.content || '').trim();
  return { text, toolCalls, parsed: parseJson(text) };
}

async function runModel(payload) {
  const config = payload.config || {};
  const providerId = config.providerId || 'openai';
  if (providerId === 'openai') {
    return runOpenAIResponses({
      apiKey: getCloudKey(),
      model: config.model,
      input: payload.input,
      instructions: payload.instructions,
      tools: payload.tools,
      outputSchema: payload.outputSchema,
      attachments: payload.attachments,
    });
  }
  const baseUrl = providerId === 'custom' ? config.customBaseUrl : config.localBaseUrl;
  return runOpenAICompatible({
    baseUrl,
    apiKey: null,
    model: config.model,
    input: payload.input,
    instructions: payload.instructions,
    tools: payload.tools,
    outputSchema: payload.outputSchema,
    attachments: payload.attachments,
  });
}

function wrap(handler) {
  return async (event, ...args) => {
    try {
      return { ok: true, data: await handler(event, ...args) };
    } catch (err) {
      return { ok: false, error: err.message || 'Brain error' };
    }
  };
}

function setupBrainIpc() {
  ipcMain.removeHandler('brain:pick-folder');
  ipcMain.removeHandler('brain:list-roots');
  ipcMain.removeHandler('brain:remove-root');
  ipcMain.removeHandler('brain:list-dir');
  ipcMain.removeHandler('brain:read-text');
  ipcMain.removeHandler('brain:read-image');
  ipcMain.removeHandler('brain:has-cloud-key');
  ipcMain.removeHandler('brain:set-cloud-key');
  ipcMain.removeHandler('brain:clear-cloud-key');
  ipcMain.removeHandler('brain:run');

  ipcMain.handle('brain:pick-folder', wrap(async (event) => pickFolder(event)));
  ipcMain.handle('brain:list-roots', wrap(async () => publicRoots()));
  ipcMain.handle('brain:remove-root', wrap(async (_event, rootId) => {
    const roots = loadRoots();
    delete roots[rootId];
    saveRoots(roots);
    return publicRoots();
  }));
  ipcMain.handle('brain:list-dir', wrap(async (_event, rootId, relativePath) => listDir(rootId, relativePath)));
  ipcMain.handle('brain:read-text', wrap(async (_event, rootId, relativePath) => readText(rootId, relativePath)));
  ipcMain.handle('brain:read-image', wrap(async (_event, rootId, relativePath) => readImage(rootId, relativePath)));
  ipcMain.handle('brain:has-cloud-key', wrap(async () => ({ configured: Boolean(getCloudKey()) })));
  ipcMain.handle('brain:set-cloud-key', wrap(async (_event, key) => setCloudKey(key)));
  ipcMain.handle('brain:clear-cloud-key', wrap(async () => clearCloudKey()));
  ipcMain.handle('brain:run', wrap(async (_event, payload) => runModel(payload || {})));
}

module.exports = { setupBrainIpc };
