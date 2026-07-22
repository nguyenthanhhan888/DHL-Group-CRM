import { getSupabaseClient } from '../supabase/client.js';

export const AuthService = {
  async initialize() {
    const client = requireClient();
    const authHash = /(?:^#|[&#])(access_token|refresh_token|error|error_code)=/.test(window.location.hash);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    if (authHash) {
      const nextRoute = data.session ? '#/dashboard' : '#/login';
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextRoute}`);
    }

    return data.session || null;
  },

  async signIn(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  },

  async getCurrentProfile(userId) {
    if (!userId) return null;
    const { data, error } = await requireClient()
      .from('user_roles')
      .select('user_id, username, display_name, role, is_active')
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return data;
  },
};

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase chưa được cấu hình.');
  return client;
}
