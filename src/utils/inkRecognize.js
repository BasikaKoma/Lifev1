import { getOpenAiKey } from '../lib/openai';

const SYSTEM_PROMPT = `You transcribe handwritten text from images for a Greek productivity app.
The canvas has black background and white/light ink. Text may span multiple lines but forms sentences or phrases.

CRITICAL — language & script:
- The writer is Greek. Default to GREEK (Ελληνικά) unless clearly English.
- Use Greek Unicode: Α-Ω, α-ω. NEVER Cyrillic (Д, У, etc.). Greek Δ ≠ Cyrillic Д.
- Do NOT translate. Transcribe what is written.

CRITICAL — sentences & reading order:
- Read ALL ink as connected meaning: full sentences, phrases, or titles — NOT one word per line.
- Reading order: top to bottom, left to right within each line. Words on separate lines that belong together → one sentence with spaces.
- Example layout:
    ΘΕΛΩ
    ΝΑ ΦΤΙΑΞΩ
    ΕΝΑ ΣΥΣΤΗΜΑ
  → output: "ΘΕΛΩ ΝΑ ΦΤΙΑΞΩ ΕΝΑ ΣΥΣΤΗΜΑ" (single line, spaces between words)
- Use word context: ΘΕΛΩ + ΝΑ + ΦΤΙΑΞΩ + ΕΝΑ + ΣΥΣΤΗΜΑ = one Greek sentence.
- Preserve punctuation if visible. Use normal sentence casing (don't force ALL CAPS unless clearly all caps).
- "text" must be ONE string — never newline-separated word lists.

Return ONLY valid JSON:
{"text":"full sentence or phrase","suggestedType":"milestone"|"major"|"sticky"|"note"|"goal"}
- suggestedType: short title → milestone/sticky; longer sentence/paragraph → note; aspiration → goal
If unreadable, return {"text":"","suggestedType":"sticky"}`;

const RETRY_USER_TEXT =
  'Greek handwriting. Output ONE flowing sentence (words joined with spaces). No Cyrillic. No word-per-line.';

const REFINE_PROMPT = `You reconstruct Greek text from messy OCR of handwriting.
The OCR may have one word per line, garbled letters, or wrong characters.
Fix using context (e.g. ΝΑ + ΕΝΑ + ΣΥΣΤΗΜΑ → likely "Θέλω να φτιάξω ένα σύστημα" or similar).
Rules:
- Output ONE Greek sentence or phrase, words separated by spaces.
- Fix obvious OCR errors; do not invent unrelated content.
- No Cyrillic. No newlines in output.
Return ONLY JSON: {"text":"..."}`;

const VALID_TYPES = new Set(['milestone', 'major', 'sticky', 'note', 'goal']);

function containsCyrillic(text) {
  return /[\u0400-\u04FF]/.test(text);
}

function isFragmented(text) {
  if (!text) return false;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return true;
  if (lines.length === 1 && text.includes('\n')) return true;
  return false;
}

/** Join word-per-line OCR into a single sentence. */
export function normalizeRecognizedText(text) {
  if (!text) return text;
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return text.replace(/\s+/g, ' ').trim();
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function parseRecognitionResponse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw.trim(), suggestedType: 'sticky' };
  }
}

async function callVisionApi(key, pngDataUrl, userText) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: pngDataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    let message = 'Αποτυχία αναγνώρισης γραφής.';
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const parsed = parseRecognitionResponse(raw);
  const text = (parsed.text || '').trim();
  const suggestedType = VALID_TYPES.has(parsed.suggestedType) ? parsed.suggestedType : 'sticky';
  return { text, suggestedType };
}

async function refineFragmentedText(key, rawText) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: REFINE_PROMPT },
        {
          role: 'user',
          content: `OCR fragments:\n${rawText}\n\nReconstruct as one Greek sentence.`,
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const parsed = parseRecognitionResponse(raw);
  const text = normalizeRecognizedText((parsed.text || '').trim());
  return text || null;
}

function inferSuggestedType(text, current) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 6) return 'note';
  if (words.length >= 3 && text.length > 24) return 'note';
  return current;
}

/**
 * @param {string} pngDataUrl data:image/png;base64,...
 * @returns {Promise<{ text: string, suggestedType: string }>}
 */
export async function recognizeHandwriting(pngDataUrl) {
  const key = getOpenAiKey();
  if (!key) {
    throw new Error('Δεν έχεις OpenAI API key. Πήγαινε Settings → Voice.');
  }
  if (!pngDataUrl) {
    throw new Error('Δεν υπάρχει εικόνα για αναγνώριση.');
  }

  const userPrompt =
    'Read all handwriting as one or more Greek sentences. Join words with spaces. ' +
    'Multiple lines = same sentence unless clearly separate. No Cyrillic.';

  let result = await callVisionApi(key, pngDataUrl, userPrompt);

  if (containsCyrillic(result.text)) {
    result = await callVisionApi(key, pngDataUrl, RETRY_USER_TEXT);
  }

  if (containsCyrillic(result.text)) {
    throw new Error(
      'Η αναγνώριση έβγαλε κυριλλικούς χαρακτήρες αντί για ελληνικούς. Διόρθωσε το κείμενο χειροκίνητα ή ξαναδοκίμασε.'
    );
  }

  const beforeRefine = result.text;
  const wordCount = normalizeRecognizedText(beforeRefine).split(/\s+/).filter(Boolean).length;
  if (isFragmented(beforeRefine) || wordCount >= 4) {
    const refined = await refineFragmentedText(key, normalizeRecognizedText(beforeRefine));
    if (refined && !containsCyrillic(refined)) {
      result = {
        text: refined,
        suggestedType: inferSuggestedType(refined, result.suggestedType),
      };
    }
  }

  result.text = normalizeRecognizedText(result.text);
  result.suggestedType = inferSuggestedType(result.text, result.suggestedType);

  if (!result.text) {
    throw new Error('Δεν μπόρεσα να διαβάσω τη γραφή. Δοκίμασε μεγαλύτερα γράμματα ή καθαρότερη επιλογή.');
  }

  return result;
}
