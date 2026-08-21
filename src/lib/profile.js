import { getSupabaseClient, isSupabaseConfigured } from './supabase';

export async function fetchProfile() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, height_cm, birthdate, sex')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    id: user.id,
    email: data?.email ?? user.email,
    displayName: data?.display_name ?? user.user_metadata?.display_name ?? '',
    heightCm: data?.height_cm ?? null,
    birthdate: data?.birthdate ?? null,
    sex: data?.sex ?? null,
  };
}

export async function updateDisplayName(displayName) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const trimmed = displayName.trim();
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      display_name: trimmed || null,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;

  await supabase.auth.updateUser({
    data: { display_name: trimmed || null },
  });

  return trimmed;
}
