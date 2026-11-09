import { transportRun } from '../../brain/transport';
import { assertLocalEndpointAllowed, loadBrainConfig, resolveBrainModel } from '../../brain/config';
import { withTimeout } from '../../utils/withTimeout';

const ORGANIZE_INSTRUCTIONS = `You turn a quick, free-form note into the checklist of one work block.
Return JSON only: {"tasks": ["..."]}.
- Keep the note's language. Never translate.
- One concrete task per item, starting with a verb when natural, under 80 characters.
- Only work the note states or clearly implies. Never add tasks of your own.
- Keep names, numbers and links exactly as written.
- At most 8 tasks, in the order the note gives them.`;

const ORGANIZE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks'],
  properties: {
    tasks: { type: 'array', items: { type: 'string' } },
  },
};

function parseJson(text) {
  if (text && typeof text === 'object') return text;
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function organizeBlockTasks(note, { blockTitle, goalTitle, signal } = {}) {
  const text = String(note || '').trim();
  if (!text) return [];

  const loaded = loadBrainConfig();
  const model = resolveBrainModel(loaded);
  const config = { ...loaded, model };
  if (!model) throw new Error('Όρισε μοντέλο Brain στις Ρυθμίσεις για να οργανώνει το AI τις εργασίες.');
  assertLocalEndpointAllowed(config);

  const result = await withTimeout(
    transportRun(config, {
      instructions: ORGANIZE_INSTRUCTIONS,
      input: [
        [goalTitle, blockTitle].filter(Boolean).length ? `Block: ${[goalTitle, blockTitle].filter(Boolean).join(' · ')}` : '',
        'NOTE',
        text,
      ].filter(Boolean).join('\n'),
      tools: [],
      outputSchema: ORGANIZE_SCHEMA,
    }, signal),
    45000,
    'Η οργάνωση άργησε πολύ. Δοκίμασε ξανά.',
  );

  const parsed = result?.parsed || parseJson(result?.text);
  const tasks = (Array.isArray(parsed?.tasks) ? parsed.tasks : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!tasks.length) throw new Error('Το AI δεν πρότεινε εργασίες. Δοκίμασε να γράψεις λίγο πιο αναλυτικά.');
  return tasks;
}
