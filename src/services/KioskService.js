import { applyPagination, applySort, requireSupabaseClient, runQuery } from './BaseService.js';
import { startOfToday, toDateOnly } from '../utils/date.js';

const KIOSK_SELECT = '*, customers(id, facebook_name, facebook_id, phone, address, status, total_paid, total_kiosks, note), categories(name), business_types(name, price_per_month)';
const EXPIRING_WINDOW_DAYS = 30;

export const KioskService = {
  async list({
    searchTerm = '',
    status = '',
    businessTypeId = '',
    sort = { column: 'created_at', ascending: false },
    pagination,
  } = {}) {
    const supabase = requireSupabaseClient();
    const normalizedSearch = normalizeSearchTerm(searchTerm);
    let query = supabase
      .from('kiosks')
      .select(KIOSK_SELECT, { count: 'exact' });

    if (normalizedSearch) {
      const businessTypeIds = await findBusinessTypeIds(supabase, normalizedSearch);
      query = query.or(buildSearchFilter(normalizedSearch, businessTypeIds));
    }

    query = applyStatusFilter(query, status);
    if (businessTypeId) query = query.eq('business_type_id', businessTypeId);

    return runQuery(applyPagination(applySort(query, sort), pagination));
  },

  async getById(id) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('kiosks')
        .select(KIOSK_SELECT)
        .eq('id', id)
        .single(),
    );
  },

  async listByCustomer(customerId) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('kiosks')
        .select('id, facebook_name, facebook_id, start_date, end_date, status, auto_approve, categories(name), business_types(name)')
        .eq('customer_id', customerId)
        .order('facebook_name'),
    );
  },

  async create(kiosk) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('kiosks')
        .insert([kiosk])
        .select()
        .single(),
    );
  },

  async update(id, kiosk) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('kiosks')
        .update(kiosk)
        .eq('id', id)
        .select()
        .single(),
    );
  },

  async setStatus(id, status) {
    return KioskService.update(id, { status });
  },
};

function normalizeSearchTerm(value) {
  return String(value || '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyStatusFilter(query, status) {
  if (!status) return query;

  const today = startOfToday();
  const todayDate = toDateOnly(today);

  if (status === 'expired') {
    return query.or(`status.eq.expired,end_date.lt.${todayDate}`);
  }

  if (status !== 'warning') return query.eq('status', status);

  const warningEndDate = new Date(today);
  warningEndDate.setDate(today.getDate() + EXPIRING_WINDOW_DAYS);

  return query
    .eq('status', 'active')
    .gte('end_date', todayDate)
    .lte('end_date', toDateOnly(warningEndDate));
}

async function findBusinessTypeIds(supabase, searchTerm) {
  const { data, error } = await supabase
    .from('business_types')
    .select('id')
    .ilike('name', `%${searchTerm}%`)
    .limit(50);

  if (error) throw error;
  return (data || []).map((item) => item.id).filter(Boolean);
}

function buildSearchFilter(searchTerm, businessTypeIds = []) {
  const pattern = `%${searchTerm}%`;
  const conditions = [
    `facebook_id.ilike.${pattern}`,
    `facebook_name.ilike.${pattern}`,
    `status.ilike.${pattern}`,
  ];

  if (businessTypeIds.length) {
    conditions.push(`business_type_id.in.(${businessTypeIds.join(',')})`);
  }

  return conditions.join(',');
}
