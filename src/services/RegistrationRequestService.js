import { requireSupabaseClient, runQuery } from './BaseService.js';

export const RegistrationRequestService = {
  async list(status = 'pending') {
    let query = requireSupabaseClient()
      .from('registration_requests')
      .select('id, facebook_name, facebook_id, facebook_link, phone, service_name, months, total_amount, status, submitted_at, reviewed_at, rejection_reason, customer_id, kiosk_id, categories(name), business_types(name)')
      .order('submitted_at', { ascending: false });
    if (status) query = query.eq('status', status);
    return runQuery(query);
  },

  async approve(id) {
    return runQuery(requireSupabaseClient().rpc('approve_registration_request', {
      request_id_input: id,
    }));
  },

  async reject(id, reason) {
    return runQuery(requireSupabaseClient().rpc('reject_registration_request', {
      request_id_input: id,
      reason_input: reason,
    }));
  },
};
