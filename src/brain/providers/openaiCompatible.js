export async function runOpenAICompatible({
  baseUrl,
  apiKey,
  model,
  input,
  instructions,
  tools,
  outputSchema,
  attachments,
  signal,
}) {
  if (!baseUrl) throw new Error('Missing local/custom endpoint.');
  if (!model) throw new Error('Set a model in Brain settings.');

  const messages = [
    instructions ? { role: 'system', content: instructions } : null,
    { role: 'user', content: buildCompatibleContent(input, attachments) },
  ].filter(Boolean);

  const body = {
    model,
    temperature: 0.2,
    messages,
  };

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

  if (outputSchema) {
    body.response_format = { type: 'json_object' };
    messages[0] = {
      role: 'system',
      content: `${instructions || ''}\n\nReturn ONLY JSON matching this schema:\n${JSON.stringify(outputSchema)}`.trim(),
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Local model error ${response.status}`);
  }

  const message = data?.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((call) => ({
    id: call.id,
    name: call.function?.name,
    arguments: safeParseJson(call.function?.arguments),
  }));
  const text = String(message.content || '').trim();
  return {
    text,
    toolCalls,
    parsed: safeParseJson(text),
  };
}

function buildCompatibleContent(input, attachments) {
  const parts = [String(input || '')];
  for (const file of attachments || []) {
    if (file?.text) parts.push(`\n\nFILE ${file.name || ''}\n${file.text}`);
    if (file?.kind === 'image' && file.dataUrl) {
      parts.push(`\n\n[image attached: ${file.name || 'image'}]`);
    }
  }
  return parts.join('');
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
