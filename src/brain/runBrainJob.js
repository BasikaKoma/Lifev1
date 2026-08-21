import { freezeBrainContext } from './context';
import { loadBrainConfig, assertLocalEndpointAllowed, getProviderDestination, getProviderCapabilities, resolveBrainModel } from './config';
import { loadBrainPolicy, canCloudSeeAppData, canCloudSeeLocalFiles } from './policy';
import { prependBrainInsights } from './insights';
import { buildMemoryPack } from './memory/pack';
import { persistMemories, persistMemory, searchMemories } from './memory/repository';
import { buildSnapshot, redactSnapshotForCloud } from './snapshot/buildSnapshot';
import {
  catalogFromProjectList,
  findMentionedProjects,
  loadAppCatalog,
  resolveProjectQuery,
} from './snapshot/loadAppCatalog';
import { BRAIN_INSIGHTS_SCHEMA, BRAIN_TOOLS } from './schema';
import { transportRun } from './transport';
import { brainListDir, brainListRoots, brainReadImage, brainReadText, hasElectronBrain } from '../platform/brain';

const MAX_TOOL_ROUNDS = 4;

function buildInstructions(kind) {
  return `You are the Brain of lifev1 in an ongoing conversation. Memory lives in Lifev1, not in the model provider.
MEMORY tells you who the user is, how they want you to work, what they are looking at, what happened in this conversation, and which older facts are still current.
Prefer MEMORY.standingFacts and MEMORY.relevantMemories with status=current. Treat status=old or superseded as historical only, and say where a fact came from when it matters.
You also see the whole application in SNAPSHOT: Self, Lifeline, and every project.
The current focus is only what the user is looking at right now. It is not the only project you know.
If the user names a project, look it up in SNAPSHOT.mentionedProjects or SNAPSHOT.projects first.
Use get_project, remember, or search_memory when needed. remember stores durable Lifev1 memory (decisions, preferences, values, goals, style, brand, writing examples, drafts).
LOCAL FILES is authoritative. If it lists folders, you already have access. Answer yes, name the folders and files, and use list_dir / read_file / read_image with rootId + relativePath when you need more. Never say no folder is available when LOCAL FILES is present.
Never rely on OpenAI conversation_id or previous_response_id. Never invent facts.
Reply in the user's language (Greek or English).
${kind === 'ask' ? 'Answer the latest user message using MEMORY, the conversation, and the full app catalog.' : 'Analyze across the full app when useful, and produce 3-6 concrete insights.'}
Every insight must include real source IDs from the snapshot or memory ids.
If data is missing after checking the catalog and memory, say so.`;
}

function allowedTools(policy, destination) {
  const tools = [
    BRAIN_TOOLS.find((tool) => tool.name === 'remember'),
    BRAIN_TOOLS.find((tool) => tool.name === 'search_memory'),
  ];
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

export async function runBrainJob({
  kind = 'analyze',
  question = '',
  history = [],
  conversationId = null,
  liveContext,
  snapshotInput,
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
  let catalog = [];
  if (policy.appScopes.projects) {
    try {
      catalog = await loadAppCatalog();
    } catch {
      catalog = catalogFromProjectList(snapshotInput?.projectList || []);
    }
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

  const userText = kind === 'ask'
    ? questionText || 'Τι βλέπεις στο τρέχον context;'
    : questionText || 'Ανάλυσε το τρέχον Lifeline context και βγάλε insights.';

  const tools = capabilities.supportsTools ? allowedTools(policyWithRoots, destination) : [];
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
  let input = `${userText}${localFilesBlock}\n\nMEMORY\n${JSON.stringify(memory)}\n\nSNAPSHOT\n${JSON.stringify(snapshot)}`;
  const attachments = [];
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
      instructions: buildInstructions(kind),
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

    const insights = collectInsights(result).map((item) => ({
      ...item,
      context,
      createdAt: new Date().toISOString(),
    }));
    prependBrainInsights(insights, context);
    persistMemories(insights.map((item) => ({
      kind: item.kind === 'suggestion' || item.kind === 'alert' ? 'conclusion' : 'insight',
      title: item.title,
      body: item.body,
      status: 'current',
      sourceKind: 'brain',
      sourceId: item.id || null,
      conversationId,
      data: { sources: item.sources || [], confidence: item.confidence, insightKind: item.kind },
    })));
    return { context, snapshot, memory, insights, capabilities };
  }

  throw new Error('Ο Brain σταμάτησε μετά από πολλά tool calls.');
}
