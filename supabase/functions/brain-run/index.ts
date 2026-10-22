import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/supabase.ts';

type BrainTool = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

// Override with the BRAIN_ALLOWED_MODELS secret (comma-separated).
const DEFAULT_ALLOWED_MODELS = ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna'];
const MAX_PROMPT_CHARS = 500_000;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_TEXT_CHARS = 200_000;
const MAX_IMAGE_DATA_URL_CHARS = 10_000_000;
const MAX_TOOLS = 64;
const MAX_OUTPUT_TOKENS = 32_000;

function envList(name: string): string[] {
  return (Deno.env.get(name) ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function allowedModels(): string[] {
  const configured = envList('BRAIN_ALLOWED_MODELS');
  return configured.length ? configured : DEFAULT_ALLOWED_MODELS;
}

/** Empty when BRAIN_ALLOWED_USER_IDS is unset, which lets every signed-in user in. */
function allowedUserIds(): string[] {
  return envList('BRAIN_ALLOWED_USER_IDS');
}

function requestTooLarge(body: BrainRequest): string | null {
  const promptChars = String(body.instructions || '').length + String(body.input || '').length;
  if (promptChars > MAX_PROMPT_CHARS) return 'Request is too large';
  const attachments = body.attachments || [];
  if (attachments.length > MAX_ATTACHMENTS) return `At most ${MAX_ATTACHMENTS} attachments`;
  for (const file of attachments) {
    if (String(file?.text || '').length > MAX_ATTACHMENT_TEXT_CHARS) return 'Attachment is too large';
    if (String(file?.dataUrl || '').length > MAX_IMAGE_DATA_URL_CHARS) return 'Image is too large';
  }
  if ((body.tools || []).length > MAX_TOOLS) return 'Too many tools';
  return null;
}

type BrainRequest = {
  model?: string;
  instructions?: string;
  input?: string;
  tools?: BrainTool[];
  outputSchema?: Record<string, unknown>;
  attachments?: Array<{ kind?: string; name?: string; text?: string; dataUrl?: string }>;
};

function parseJson(value: unknown): unknown {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildInput(input: string | undefined, attachments: BrainRequest['attachments']) {
  const content: Array<Record<string, string>> = [
    { type: 'input_text', text: String(input || '') },
  ];
  for (const file of attachments || []) {
    if (file?.kind === 'image' && file.dataUrl) {
      content.push({ type: 'input_image', image_url: file.dataUrl });
    } else if (file?.text) {
      content.push({ type: 'input_text', text: `\n\nFILE ${file.name || ''}\n${file.text}` });
    }
  }
  return [{ role: 'user', content }];
}

function parseResponsesResult(data: Record<string, unknown>) {
  const toolCalls: Array<{ id?: string; name?: string; arguments: unknown }> = [];
  const texts: string[] = [];
  const output = Array.isArray(data.output) ? data.output : [];

  for (const item of output) {
    const row = item as Record<string, unknown>;
    if (row.type === 'function_call') {
      toolCalls.push({
        id: String(row.call_id || row.id || ''),
        name: String(row.name || ''),
        arguments: parseJson(row.arguments),
      });
    }
    if (row.type === 'message' && Array.isArray(row.content)) {
      for (const part of row.content) {
        const piece = part as Record<string, unknown>;
        if (piece.type === 'output_text' && typeof piece.text === 'string') {
          texts.push(piece.text);
        }
      }
    }
  }

  const text = texts.join('\n').trim() || (typeof data.output_text === 'string' ? data.output_text : '');
  return { text, toolCalls, parsed: parseJson(text) };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await getUserFromRequest(req);
    const userIds = allowedUserIds();
    if (userIds.length && !userIds.includes(user.id)) {
      return errorResponse('Brain is not enabled for this account', 403);
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return errorResponse('OPENAI_API_KEY is not configured on the server.', 500);
    }

    const body = (await req.json()) as BrainRequest;
    const model = String(body.model || '').trim();
    if (!model) {
      return errorResponse('Missing model', 400);
    }
    if (!allowedModels().includes(model)) {
      return errorResponse(`Model ${model.slice(0, 60)} is not allowed`, 400);
    }
    const tooLarge = requestTooLarge(body);
    if (tooLarge) {
      return errorResponse(tooLarge, 413);
    }

    const payload: Record<string, unknown> = {
      model,
      store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      instructions: body.instructions || undefined,
      input: buildInput(body.input, body.attachments),
    };

    if (Array.isArray(body.tools) && body.tools.length) {
      payload.tools = body.tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    }

    if (body.outputSchema) {
      payload.text = {
        format: {
          type: 'json_schema',
          name: 'brain_insights',
          strict: true,
          schema: body.outputSchema,
        },
      };
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (data as { error?: { message?: string } })?.error?.message
        || `OpenAI Responses error ${response.status}`;
      return errorResponse(message, 502);
    }

    return jsonResponse(parseResponsesResult(data as Record<string, unknown>));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Brain run failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
