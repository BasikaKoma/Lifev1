import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AuthUser = {
  id: string;
  email?: string | null;
};

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing Supabase service configuration');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: Request): string {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization');
  }
  return authHeader.slice('Bearer '.length).trim();
}

/** Verifies the user JWT with Supabase Auth, so a forged token fails even where verify_jwt is off. */
export async function getUserFromRequest(req: Request): Promise<AuthUser> {
  const token = getBearerToken(req);
  if (token.split('.').length !== 3) {
    throw new Error('Invalid session');
  }

  const { data, error } = await getServiceClient().auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new Error('Invalid session');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

/** Authorize cron / admin callers (exact service role key or vault cron secret). */
export async function assertServiceOrCronAuth(req: Request): Promise<void> {
  const token = getBearerToken(req);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token === serviceKey) return;

  const cronSecret = Deno.env.get('OURA_CRON_SECRET') ?? '';
  if (cronSecret && token === cronSecret) return;

  const { data, error } = await getServiceClient().rpc('internal_get_oura_cron_secret');
  if (!error && typeof data === 'string' && data && token === data) return;

  const assistant = await getServiceClient().rpc('internal_get_assistant_cron_secret');
  if (!assistant.error && typeof assistant.data === 'string' && assistant.data && token === assistant.data) return;

  const push = await getServiceClient().rpc('internal_get_push_cron_secret');
  if (!push.error && typeof push.data === 'string' && push.data && token === push.data) return;

  throw new Error('Missing authorization');
}
