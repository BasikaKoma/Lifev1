import { freezeBrainContext } from './context';
import { appModelText } from './appModel';
import { loadBrainConfig, assertLocalEndpointAllowed, getProviderDestination, getProviderCapabilities, resolveBrainModel } from './config';
import { loadBrainPolicy, canCloudSeeAppData, canCloudSeeLocalFiles } from './policy';
import { normalizeInsight, prependBrainInsights } from './insights';
import { buildMemoryPack } from './memory/pack';
import { persistLearnedMemories, persistMemory, searchMemories } from './memory/repository';
import { buildSnapshot, redactSnapshotForCloud } from './snapshot/buildSnapshot';
import {
  catalogFromSnapshotInput,
  findMentionedProjects,
  loadAppCatalog,
  mergeProjectCatalogs,
  resolveProjectQuery,
} from './snapshot/loadAppCatalog';
import { BRAIN_INSIGHTS_SCHEMA, BRAIN_TOOLS } from './schema';
import { transportRun } from './transport';
import { applyRouteToSnapshot, routeQuestion } from './router';
import { buildSourceIndex } from './sources';
import { brainListDir, brainListRoots, brainReadImage, brainReadText, hasElectronBrain } from '../platform/brain';

const MAX_TOOL_ROUNDS = 4;

function buildInstructions(kind, routeMode) {
  const briefing = kind === 'briefing' || routeMode === 'briefing';
  return `You are the Brain of lifev1: the personal advisor for the whole application, not a chatbot of Brain settings.
${appModelText()}
SNAPSHOT.coverage tells you what loaded. If coverage.loaded is true, the app data is in SNAPSHOT — use it.
SNAPSHOT.route.mode is a local router: today = Self + today + 1-2 active projects; project = named project in depth; strategy = full portfolio; create = app model + related titles; briefing = weekly patterns.
MEMORY.laws are standing personal laws (max 10). Strategic answers MUST respect them. Do not invent new laws unless the user stated one.
MEMORY.whoYouAre is only voice, values, and preferences. Never answer a strategy question from settings alone.
When advising, name real projects, checkpoints, notes, and day outcomes from SNAPSHOT and cite their source IDs.
Do not emit an ALERT that projects/lifeline were not loaded if coverage.projectCount > 0 or coverage.lifelineDays > 0. Empty arrays mean no items that day, not a failed load.
The current focus is only the open screen. Look at SNAPSHOT.projects and SNAPSHOT.patterns.portfolio.
If they state a durable fact about themselves (preference, value, goal, style, brand, writing example, decision, standing law), put it in newMemories. If nothing new, newMemories must be []. Never invent memories. Never use a tool just to store memory.
${kind === 'ask' ? 'Call get_project only if a named project is missing checkpoints/notes in SNAPSHOT.' : 'Use search_memory or get_project only when packed MEMORY/SNAPSHOT is missing something you must look up.'}
LOCAL FILES is authoritative. If it lists folders, you already have access. Answer yes, name the folders and files, and use list_dir / read_file / read_image with rootId + relativePath when you need more. Never say no folder is available when LOCAL FILES is present.
Never rely on OpenAI conversation_id or previous_response_id. Never invent facts.
Reply in the user's language (Greek or English).
${briefing
    ? 'WEEKLY BRIEFING. From SNAPSHOT.patterns say: what moved, what is stuck, the next move. 3-6 concrete insights with real source IDs. actions=[] unless they asked to create or complete something.'
    : (kind === 'ask'
      ? 'Answer as their advisor using APP MODEL + SNAPSHOT first, then MEMORY for tone and MEMORY.laws for strategy. If they ask whether something should be a project, use APP MODEL.personalBrandRule / decisionRule and the existing SNAPSHOT.projects. If they asked you to create it in the app (φτιάξτο, δημιούργησε, κάνε το, create it, πρόσθεσέ το), fill actions. Advice-only questions must have actions=[]. Never duplicate an existing SNAPSHOT.projects title. For create_project: title, body=purpose, stageTitle=first milestone, items=checkpoint titles (max 8). After creating, also emit open_project with the same title. To add/complete/update on an EXISTING project, set projectTitle to that project and use create_checkpoint, complete_checkpoint, update_note, or update_checkpoint — this works from Lifeline.'
      : 'Analyze across Self, Lifeline days, and every project. Produce 3-6 concrete insights with real source IDs from projects, checkpoints, notes, or days. actions=[] unless they asked to create something.')}
Every insight must include real source IDs from SNAPSHOT (project:, checkpoint:, note:, lifeline-day:, self:).`;
}

function allowedTools(policy, destination, kind) {
  const tools = [];
  if (kind !== 'ask') tools.push(BRAIN_TOOLS.find((tool) => tool.name === 'search_memory'));
  if (policy.appScopes.projects) tools.push(BRAIN_TOOLS.find((tool) => tool.name === 'get_project'));
  if (hasElectronBrain() && canCloudSeeLocalFiles(policy, destination)) {
    if (policy.tools.listDir !== false) tools.push(BRAIN_TOOLS.find((tool) => tool.name === 'list_dir'));
    if (policy.tools.readFile !== false) tools.push(BRAIN_TOOLS.find((tool) => tool.name === 'read_file'));
    if (policy.tools.readImage !== false) tools.push(BRAIN_TOOLS.find((tool) => tool.name === 'read_image'));
  }
  return tools.filter(Boolean);
}

const IMAGE_HINT = /φωτο|εικον|image|photo|picture|screenshot|jpg|jpeg|png|webp/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

async function loadLocalFolders(roots = []) {
  const folders = [];
  for (const root of (roots || []).slice(0, 8)) {
    try {
      const entries = await brainListDir(root.rootId, '');
      folders.push({
        rootId: root.rootId,
        displayName: root.displayName,
        entries: Array.isArray(entries) ? entries : [],
      });
    } catch {
      folders.push({
        rootId: root.rootId,
        displayName: root.displayName,
        entries: [],
      });
    }
  }
  return folders;
}

function collectFolderImages(folders) {
  const images = [];
  for (const folder of folders || []) {
    for (const entry of folder.entries || []) {
      if (entry.kind === 'file' && IMAGE_EXT.test(entry.name || '')) {
        images.push({
          rootId: folder.rootId,
          relativePath: entry.relativePath,
          name: entry.name,
        });
      }
    }
  }
  return images;
}

async function executeTool(name, args, { policy, destination, catalog, conversationId }) {
  if (name === 'remember') {
    return persistMemory({
      kind: args.kind,
      title: args.title,
      body: args.body,
      status: args.status || 'current',
      sourceKind: 'brain',
      conversationId: conversationId || null,
    });
  }
  if (name === 'search_memory') {
    return searchMemories(args.query, { status: 'current', limit: 12 });
  }
  if (name === 'get_project') {
    if (!policy.appScopes.projects) throw new Error('Projects scope is off.');
    const query = args.query || args.projectId || args.name;
    return resolveProjectQuery(query, catalog);
  }

  if (!hasElectronBrain()) throw new Error('Local files are only available in the desktop app.');
  if (!canCloudSeeLocalFiles(policy, destination)) {
    throw new Error('cloudMaySeeLocalFiles is off.');
  }

  if (name === 'list_dir') {
    if (policy.tools.listDir === false) throw new Error('listDir is off.');
    return brainListDir(args.rootId, args.relativePath || '');
  }
  if (name === 'read_file') {
    if (policy.tools.readFile === false) throw new Error('readFile is off.');
    return brainReadText(args.rootId, args.relativePath);
  }
  if (name === 'read_image') {
    if (policy.tools.readImage === false) throw new Error('readImage is off.');
    return brainReadImage(args.rootId, args.relativePath);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function collectInsights(result) {
  const parsed = result?.parsed;
  if (parsed?.insights && Array.isArray(parsed.insights)) return parsed.insights;
  if (result?.text) {
    try {
      const fromText = JSON.parse(result.text);
      if (Array.isArray(fromText.insights)) return fromText.insights;
    } catch {
      /* ignore */
    }
    return [{
      kind: 'summary',
      title: 'Brain',
      body: result.text,
      confidence: 0.4,
      sources: [],
    }];
  }
  return [];
}

function collectNewMemories(result) {
  const parsed = result?.parsed;
  if (Array.isArray(parsed?.newMemories)) return parsed.newMemories;
  if (result?.text) {
    try {
      const fromText = JSON.parse(result.text);
      if (Array.isArray(fromText.newMemories)) return fromText.newMemories;
    } catch {
      /* ignore */
    }
  }
  return [];
}

function collectActions(result) {
  const parsed = result?.parsed;
  if (Array.isArray(parsed?.actions)) return parsed.actions;
  if (result?.text) {
    try {
      const fromText = JSON.parse(result.text);
      if (Array.isArray(fromText.actions)) return fromText.actions;
    } catch {
      /* ignore */
    }
  }
  return [];
}

export async function runBrainJob({
  kind = 'analyze',
  question = '',
  history = [],
  conversationId = null,
  liveContext,
  snapshotInput,
  userAttachments = [],
  signal,
} = {}) {
  const loaded = loadBrainConfig();
  const model = resolveBrainModel(loaded);
  const config = { ...loaded, model };
  const policy = loadBrainPolicy();
  const destination = getProviderDestination(config);
  const capabilities = getProviderCapabilities(config);

  if (!model) {
    throw new Error(config.providerId === 'openai'
      ? 'Λείπει model ID για αυτό το επίπεδο. Έλεγξέ το στα Advanced Settings.'
      : 'Βάλε το όνομα του τοπικού μοντέλου στις ρυθμίσεις του Brain.');
  }
  assertLocalEndpointAllowed(config);

  const context = freezeBrainContext(liveContext);
  const localCatalog = catalogFromSnapshotInput(snapshotInput);
  let catalog = localCatalog;
  try {
    catalog = mergeProjectCatalogs(localCatalog, await loadAppCatalog());
  } catch {
    catalog = localCatalog;
  }
  const questionText = String(question || '').trim();
  const mentionText = [
    questionText,
    ...(Array.isArray(history) ? history : []).map((item) => item?.text || ''),
  ].join(' ');
  const mentionedProjects = findMentionedProjects(mentionText, catalog);
  let roots = policy.roots || [];
  if (hasElectronBrain()) {
    try {
      const liveRoots = await brainListRoots();
      if (Array.isArray(liveRoots) && liveRoots.length) roots = liveRoots;
    } catch {
      /* keep policy roots */
    }
  }
  const policyWithRoots = { ...policy, roots };
  const canUseLocalFiles = hasElectronBrain() && (roots.length > 0 || canCloudSeeLocalFiles(policyWithRoots, destination));
  const localFolders = hasElectronBrain() && roots.length ? await loadLocalFolders(roots) : [];

  let snapshot = buildSnapshot({
    context,
    policy,
    ...snapshotInput,
    projectCatalog: catalog,
    mentionedProjects,
    localFolders,
  });
  if (!canCloudSeeAppData(policy, destination)) {
    snapshot = redactSnapshotForCloud(snapshot);
  }
  const route = routeQuestion(questionText, { catalog, kind });
  const sourceIndex = buildSourceIndex({ snapshot, catalog });
  snapshot = applyRouteToSnapshot(snapshot, route, catalog);

  const userText = kind === 'ask'
    ? questionText || 'Τι βλέπεις στο τρέχον context;'
    : kind === 'briefing'
      ? questionText || 'Κάνε weekly briefing: τι κινήθηκε, τι έχει κολλήσει, ποια είναι η επόμενη κίνηση.'
      : questionText || 'Ανάλυσε το τρέχον Lifeline context και βγάλε insights.';

  const tools = capabilities.supportsTools ? allowedTools(policyWithRoots, destination, kind) : [];
  const memory = buildMemoryPack({
    question: questionText,
    history,
    context,
    tools,
    localFolders,
  });
  const localFilesBlock = localFolders.length
    ? `\n\nLOCAL FILES — ACCESS GRANTED\nIf the user asks whether you have folder access, answer YES and list these folders and files.\n${JSON.stringify(localFolders)}`
    : (hasElectronBrain()
      ? '\n\nLOCAL FILES\nNo allowlisted folder is registered in the desktop app yet.'
      : '\n\nLOCAL FILES\nLocal folders work only in the desktop app.');
  let input = `${userText}${localFilesBlock}\n\nSNAPSHOT\n${JSON.stringify(snapshot)}\n\nMEMORY\n${JSON.stringify(memory)}`;
  const attachments = [];
  for (const file of Array.isArray(userAttachments) ? userAttachments : []) {
    if (file?.dataUrl) {
      attachments.push({
        kind: 'image',
        name: file.name || 'image',
        mime: file.mime || 'image/png',
        dataUrl: file.dataUrl,
      });
    }
  }
  if (canUseLocalFiles && IMAGE_HINT.test(mentionText)) {
    for (const image of collectFolderImages(localFolders).slice(0, 2)) {
      try {
        const loaded = await brainReadImage(image.rootId, image.relativePath);
        if (loaded?.dataUrl) attachments.push(loaded);
      } catch {
        /* skip unreadable image */
      }
    }
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const result = await transportRun(config, {
      instructions: buildInstructions(kind, route.mode),
      input,
      tools,
      outputSchema: capabilities.supportsStructuredOutput ? BRAIN_INSIGHTS_SCHEMA : BRAIN_INSIGHTS_SCHEMA,
      attachments,
    }, signal);

    if (result.toolCalls?.length) {
      const toolResults = [];
      for (const call of result.toolCalls) {
        try {
          const output = await executeTool(call.name, call.arguments || {}, {
            policy: policyWithRoots,
            destination,
            catalog,
            conversationId,
          });
          if (call.name === 'read_image' && output?.dataUrl) {
            attachments.push(output);
          }
          toolResults.push({
            name: call.name,
            ok: true,
            output: call.name === 'read_image'
              ? { name: output.name, sourceId: output.sourceId, mime: output.mime, attached: true }
              : output,
          });
        } catch (err) {
          toolResults.push({ name: call.name, ok: false, error: err.message });
        }
      }
      input += `\n\nTOOL RESULTS\n${JSON.stringify(toolResults)}`;
      continue;
    }

    const insights = collectInsights(result)
      .map((item) => normalizeInsight({
        ...item,
        context,
        createdAt: new Date().toISOString(),
      }))
      .filter(Boolean);
    prependBrainInsights(insights, context);
    try {
      persistLearnedMemories(collectNewMemories(result), { conversationId });
    } catch {
      /* learning must not delay or fail the reply */
    }
    return { context, snapshot, memory, insights, actions: collectActions(result), capabilities, sourceIndex, route };
  }

  throw new Error('Ο Brain σταμάτησε μετά από πολλά tool calls.');
}
