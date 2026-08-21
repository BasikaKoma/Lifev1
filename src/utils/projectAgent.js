import { getOpenAiKey } from '../lib/openai';
import { formatProjectBriefForAgent, isProjectBriefEmpty } from './projectBrief';

const SYSTEM_PROMPT = `You are the Next Move assistant for a specific business project.
Use the PROJECT BRIEF as ground truth. Never invent brand colors, facts, audience, or instructions that are not in the brief.
Follow the "Agent instructions" section strictly when it is present.
Reply in the user's language (Greek or English).
Be concise and practical.
If the user asks to add a goal, idea, note, or checkpoint, tell them the exact command to type (e.g. «Βάλε στόχο …») instead of pretending you already added it.
If the brief is empty and the question is about the project, say they should fill Settings → Project.`;

export async function askWithProjectBrief({ userText, title, brief } = {}) {
  const key = getOpenAiKey();
  if (!key) return null;

  const context = formatProjectBriefForAgent({ title, brief });
  const briefBlock = context || 'PROJECT BRIEF\n(empty — no identity, marketing, or agent instructions yet)';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: briefBlock },
        { role: 'user', content: String(userText || '').trim() },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${response.status}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

export function projectBriefHasAgentData(title, brief) {
  return Boolean(title?.trim()) || !isProjectBriefEmpty(brief);
}
