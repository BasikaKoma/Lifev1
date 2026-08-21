import { getSupabaseAnonKey, getSupabaseClient, getSupabaseUrl } from '../lib/supabase';
import { platform } from '../platform';
import { brainRunNative } from '../platform/brain';
import { assertLocalEndpointAllowed, getProviderDestination, getResolvedEndpoint } from './config';
import { runOpenAICompatible } from './providers/openaiCompatible';

async function getAccessToken() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let session = data.session;
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
  }
  if (!session?.access_token) throw new Error('Not signed in');
  return session.access_token;
}

function explainFetchError(err, fallback) {
  const message = err?.message || String(err || '');
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return fallback;
  }
  return message || fallback;
}

async function runViaEdge(payload, signal) {
  const token = await getAccessToken();
  const anonKey = getSupabaseAnonKey();
  if (!anonKey) throw new Error('Missing Supabase anon key');

  let response;
  try {
    response = await fetch(`${getSupabaseUrl()}/functions/v1/brain-run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    throw new Error(explainFetchError(
      err,
      'Δεν έφτασα την Edge Function brain-run. Κάνε deploy και βάλε OPENAI_API_KEY στα Supabase secrets.',
    ));
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Brain request failed (${response.status})`);
  }
  return data;
}

export async function transportRun(config, payload, signal) {
  const destination = getProviderDestination(config);
  if (platform.isElectron) {
    return brainRunNative({
      ...payload,
      config,
      signal: undefined,
    });
  }
  if (destination === 'local') {
    assertLocalEndpointAllowed(config);
    const { baseUrl } = getResolvedEndpoint(config);
    return runOpenAICompatible({
      baseUrl,
      apiKey: null,
      model: config.model,
      input: payload.input,
      instructions: payload.instructions,
      tools: payload.tools,
      outputSchema: payload.outputSchema,
      attachments: payload.attachments,
      signal,
    });
  }
  return runViaEdge({
    model: config.model,
    instructions: payload.instructions,
    input: payload.input,
    tools: payload.tools,
    outputSchema: payload.outputSchema,
    attachments: payload.attachments,
  }, signal);
}
