import { getOpenAiKey } from '../openai';
import { BRAND_PLATFORMS, pillarLabel } from './schema';
import { threadTitle, threadsBlock } from './threads';

const SYSTEM = `You write personal-brand content from ONE real lived experience.
You never invent generic LinkedIn advice, listicles, or "5 things I learned as an entrepreneur".
If the source is thin, say so and ask for the missing fact — do not pad with clichés.
Write in the same language as the source (Greek or English).
Stay inside Brand DNA. Never mention Nobelle. Market Portal only as a lesson, never as a pitch.
Every sentence must be traceable to the given event, thought, or draft.
If a narrative thread is provided, this post is a chapter in that longer story — not a one-off.`;

function dnaBlock(dna = {}) {
  return [
    'BRAND DNA',
    dna.whoYouAre && `Who: ${dna.whoYouAre}`,
    dna.standFor && `Stands for: ${dna.standFor}`,
    dna.audience && `Audience: ${dna.audience}`,
    dna.voice && `Voice: ${dna.voice}`,
    dna.donts && `Do not: ${dna.donts}`,
    dna.handle && `Handle: ${dna.handle}`,
  ].filter(Boolean).join('\n');
}

async function complete({ messages, temperature = 0.4, maxTokens = 900 }) {
  const key = getOpenAiKey();
  if (!key) throw new Error('Δεν έχεις OpenAI API key.');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${response.status}`);
  }
  const data = await response.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

function parseJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function generateDraftFromExperience({ dna, item, format = 'linkedin', threads = [] }) {
  const platform = BRAND_PLATFORMS.find((p) => p.id === format)?.label || format;
  const text = await complete({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: dnaBlock(dna) },
      { role: 'system', content: threadsBlock(threads, item?.threadId) },
      {
        role: 'user',
        content: `Turn this lived experience into a ${platform} draft.
It is a chapter in a longer story, not a standalone listicle.
Return JSON only:
{"title":"","hook":"","body":"","pillarId":"entrepreneurship|building|decisions|self|ai"}

Experience kind: ${item.kind || 'thought'}
Narrative thread: ${threadTitle(item.threadId) || 'none'}
Pillar hint: ${item.pillarId ? pillarLabel(item.pillarId) : 'unknown'}
What happened: ${item.body || item.title || ''}
Why it matters: ${item.why || ''}
Angle: ${item.angle || ''}
Source: ${item.sourceLabel || ''}
Existing hook: ${item.hook || ''}`,
      },
    ],
  });
  return parseJson(text);
}

export async function generateVariations({ dna, item, threads = [] }) {
  const text = await complete({
    maxTokens: 1400,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: dnaBlock(dna) },
      { role: 'system', content: threadsBlock(threads, item?.threadId) },
      {
        role: 'user',
        content: `From this ONE experience, write platform variations.
Return JSON only:
{
  "linkedin":"",
  "facebook":"",
  "instagram":"",
  "reel":"",
  "carousel":["slide 1","slide 2","slide 3"],
  "hooks":["","",""]
}

Title: ${item.title || ''}
Hook: ${item.hook || ''}
Body: ${item.body || ''}
Source: ${item.sourceLabel || ''}`,
      },
    ],
  });
  return parseJson(text);
}

export async function askBrandBrain({ dna, item, question, threads = [] }) {
  return complete({
    maxTokens: 700,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: dnaBlock(dna) },
      { role: 'system', content: threadsBlock(threads, item?.threadId) },
      {
        role: 'user',
        content: `Current draft:
Title: ${item?.title || ''}
Hook: ${item?.hook || ''}
Body: ${item?.body || ''}
Source: ${item?.sourceLabel || ''}

Question: ${question}`,
      },
    ],
  });
}

export async function developBrandSignal({ dna, signal, threads = [] }) {
  const text = await complete({
    temperature: 0.35,
    maxTokens: 800,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: dnaBlock(dna) },
      { role: 'system', content: threadsBlock(threads) },
      {
        role: 'user',
        content: `Judge this lived fragment as personal-brand material.
Do not write a full post. Do not invent facts. If it is thin, say what memory is missing.
If it belongs to a narrative thread, assign it. These are the only threads:
symphon-building = Δημιουργία του Symphon
first-customers = Πρώτοι πελάτες
vibecoding-doubt = Αμφιβολία γύρω από το vibecoding
market-portal-to-systems = Από Market Portal σε συστήματα
exposure-first-video = Δυσκολία έκθεσης και πρώτο βίντεο
business-and-life = Επιχειρηματικότητα και κατανόηση της ζωής
Write the JSON string values in the same language as the source.
Return JSON only:
{
  "verdict":"strong|thin|not-yet",
  "threadId":"symphon-building|first-customers|vibecoding-doubt|market-portal-to-systems|exposure-first-video|business-and-life",
  "core":"the one interesting thing",
  "develop":"how to expand this from real memory — questions or facts to add",
  "betterPost":"what the post should do if written now",
  "platform":"linkedin|facebook|instagram|x|reel|carousel",
  "platformWhy":"why that platform for THIS fragment",
  "also":["x"],
  "hook":"one hook only if there is enough fact, else empty",
  "missing":"the single most useful missing detail"
}

Kind: ${signal?.kind || 'thought'}
Narrative thread: ${threadTitle(signal?.threadId) || 'none'}
Source: ${signal?.sourceLabel || ''}
What: ${signal?.what || signal?.title || ''}
Why: ${signal?.why || ''}
Angle hint: ${signal?.angle || ''}
Context: ${signal?.context || ''}`,
      },
    ],
  });
  return parseJson(text);
}

export async function generateWeeklyBrief({ dna, signals, threads = [] }) {
  const text = await complete({
    temperature: 0.3,
    maxTokens: 600,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'system', content: dnaBlock(dna) },
      { role: 'system', content: threadsBlock(threads) },
      {
        role: 'user',
        content: `Propose 3-5 content directions from these REAL events of the last 7 days.
Prefer continuing a narrative thread over starting a new topic. No generic ideas.
Return JSON:
{"headline":"","directions":[{"title":"","why":"","sourceLabel":""}]}

Events:
${(signals || []).map((s, i) => `${i + 1}. ${s.what} [${s.sourceLabel}]${s.threadTitle ? ` · ${s.threadTitle}` : ''}`).join('\n') || '(none)'}`,
      },
    ],
  });
  return parseJson(text);
}
