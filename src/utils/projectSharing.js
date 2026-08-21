import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { waitForAuthSession } from '../lib/auth';
import { buildInviteUrl } from './inviteSession';

export const MAX_PROJECT_COLLABORATORS = 3;

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client unavailable');
  return supabase;
}

async function requireUserId() {
  const session = await waitForAuthSession();
  if (!session?.user) throw new Error('Not signed in');
  return session.user.id;
}

function formatError(error) {
  return error?.message || error?.details || String(error);
}

export async function getProjectSharingInfo(projectId) {
  const supabase = requireSupabase();
  const userId = await requireUserId();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, user_id, title')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) throw new Error(formatError(projectError));
  if (!project) throw new Error('Project not found');

  const isOwner = project.user_id === userId;

  const { data: members, error: membersError } = await supabase
    .from('project_members')
    .select('user_id, invited_by, created_at')
    .eq('project_id', projectId);

  if (membersError && !/could not find|relation .* does not exist|PGRST/i.test(formatError(membersError))) {
    throw new Error(formatError(membersError));
  }

  const memberIds = (members || []).map((row) => row.user_id);
  const profileIds = [...new Set([project.user_id, ...memberIds])];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .in('id', profileIds);

  const profileById = new Map((profiles || []).map((row) => [row.id, row]));
  const ownerProfile = profileById.get(project.user_id) || null;

  let shareLink = null;
  if (isOwner) {
    try {
      const linkResult = await createShareLink(projectId);
      shareLink = linkResult.url;
    } catch {
      shareLink = null;
    }
  }

  return {
    projectId,
    projectTitle: project.title,
    isOwner,
    owner: {
      id: project.user_id,
      email: ownerProfile?.email || null,
      displayName: ownerProfile?.display_name || null,
    },
    members: (members || []).map((row) => {
      const profile = profileById.get(row.user_id);
      return {
        userId: row.user_id,
        email: profile?.email || null,
        displayName: profile?.display_name || null,
        invitedBy: row.invited_by,
        createdAt: row.created_at,
      };
    }),
    memberCount: (members || []).length,
    maxMembers: MAX_PROJECT_COLLABORATORS,
    shareLink,
  };
}

export async function inviteProjectByEmail(projectId, email) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('invite_project_by_email', {
    p_project_id: projectId,
    p_email: email.trim(),
  });

  if (error) throw new Error(formatError(error));

  const token = data?.token;
  return {
    status: data?.status,
    url: token ? buildInviteUrl(token) : null,
    userId: data?.user_id || null,
  };
}

export async function createShareLink(projectId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('create_project_share_link', {
    p_project_id: projectId,
  });

  if (error) throw new Error(formatError(error));

  const token = data?.token;
  if (!token) throw new Error('Could not create share link');

  return {
    token,
    url: buildInviteUrl(token),
    inviteId: data?.invite_id || null,
  };
}

export async function acceptProjectInvite(token) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('accept_project_invite', {
    p_token: token,
  });

  if (error) throw new Error(formatError(error));

  return {
    projectId: data?.project_id,
    alreadyMember: data?.already_member === true,
  };
}

export async function removeProjectMember(projectId, memberUserId) {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('remove_project_member', {
    p_project_id: projectId,
    p_user_id: memberUserId,
  });

  if (error) throw new Error(formatError(error));
}

export async function leaveSharedProject(projectId) {
  const supabase = requireSupabase();
  const userId = await requireUserId();

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(formatError(error));
}

export async function acceptPendingInvites() {
  const supabase = requireSupabase();
  const session = await waitForAuthSession();
  const email = session?.user?.email;
  if (!email) return [];

  const { data: invites, error } = await supabase
    .from('project_invites')
    .select('token')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .ilike('email', email);

  if (error) {
    if (/could not find|relation .* does not exist|PGRST/i.test(formatError(error))) {
      return [];
    }
    throw new Error(formatError(error));
  }

  const accepted = [];
  for (const invite of invites || []) {
    try {
      const result = await acceptProjectInvite(invite.token);
      if (result.projectId) accepted.push(result);
    } catch {
      /* skip invalid invites */
    }
  }
  return accepted;
}
