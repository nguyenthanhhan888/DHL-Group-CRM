import { getSupabaseClient } from '../supabase/client.js';

export const StaffService = {
  async list() {
    return invoke({ action: 'list' });
  },

  async create(payload) {
    return invoke({ action: 'create', ...payload });
  },

  async resetPassword(userId, password) {
    return invoke({ action: 'reset_password', userId, password });
  },

  async update(userId, payload) {
    return invoke({ action: 'update', userId, ...payload });
  },

  async setActive(userId, isActive) {
    return invoke({ action: 'set_active', userId, isActive });
  },

  async remove(userId) {
    return invoke({ action: 'delete', userId });
  },
};

async function invoke(body) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase chưa được cấu hình.');
  const { data, error } = await client.functions.invoke('manage-staff', { body });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (!data?.ok) throw new Error(data?.message || 'Không thể quản lý nhân viên.');
  return data;
}

async function edgeErrorMessage(error) {
  try {
    const payload = await error.context?.json();
    return payload?.message || error.message;
  } catch {
    return error.message || 'Edge Function trả về lỗi.';
  }
}
