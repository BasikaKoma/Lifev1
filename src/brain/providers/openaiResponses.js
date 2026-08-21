export async function runOpenAIResponses({
  apiKey,
  model,
  input,
  instructions,
  tools,
  outputSchema,
  attachments,
  signal,
}) {
  if (!apiKey) throw new Error('Missing OpenAI API key.');
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
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI Responses error ${response.status}`);
  }

  return parseResponsesResult(data);
}

function buildResponsesInput(input, attachments) {
  if (Array.isArray(input)) return input;
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

export function parseResponsesResult(data) {
  const toolCalls = [];
  const texts = [];

  for (const item of data.output || []) {
    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id || item.id,
        name: item.name,
        arguments: safeParseJson(item.arguments),
      });
    }
    if (item.type === 'message') {
      for (const part of item.content || []) {
        if (part.type === 'output_text' && part.text) texts.push(part.text);
      }
    }
  }

  const text = texts.join('\n').trim() || data.output_text || '';
  return {
    text,
    toolCalls,
    parsed: safeParseJson(text),
  };
}

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
