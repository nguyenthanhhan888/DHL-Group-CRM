import { applyPagination, applySort, requireSupabaseClient, runQuery } from './BaseService.js';

export const LogService = {
  async list({
    searchTerm = '',
    action = '',
    tableName = '',
    sort = { column: 'created_at', ascending: false },
    pagination,
  } = {}) {
    const supabase = requireSupabaseClient();
    const normalizedSearch = normalizeSearchTerm(searchTerm);
    let query = supabase
      .from('logs')
      .select('*', { count: 'exact' });

    if (tableName) query = query.eq('table_name', tableName);
    if (action) query = query.eq('action', action);

    if (normalizedSearch) {
      query = query.or(buildSearchFilter(normalizedSearch));
    }

    return runQuery(applyPagination(applySort(query, sort), pagination));
  },

  async getById(id) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('logs')
        .select('*')
        .eq('id', id)
        .single(),
    );
  },
};

function normalizeSearchTerm(value) {
  return String(value || '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchFilter(searchTerm) {
  const pattern = `%${searchTerm}%`;
  const conditions = [
    `table_name.ilike.${pattern}`,
    `action.ilike.${pattern}`,
    `created_by.ilike.${pattern}`,
  ];

  if (/^\d+$/.test(searchTerm)) {
    conditions.push(`record_id.eq.${Number(searchTerm)}`);
  }

  return conditions.join(',');
}
