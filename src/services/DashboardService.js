import { requireSupabaseClient, runQuery } from './BaseService.js';
import { addMonths, startOfMonth, toDateOnly } from '../utils/date.js';

export const DashboardService = {
  async getDashboardData() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayDate = toDateOnly(today);
    const year = now.getFullYear();
    const monthStart = startOfMonth(now);
    const nextMonthStart = addMonths(monthStart, 1);
    const yearStart = new Date(year, 0, 1);
    const nextYearStart = new Date(year + 1, 0, 1);

    const [
      totalCustomers,
      totalKiosks,
      activeKiosks,
      expiredKiosks,
      monthKioskRevenue,
      yearKioskRevenue,
      categoryDistribution,
      expiringKiosks,
      recentCustomers,
    ] = await Promise.all([
      countRows('customers'),
      countRows('kiosks'),
      countRows('kiosks', (query) => query
        .eq('status', 'active')
        .or(`end_date.is.null,end_date.gte.${todayDate}`)),
      countRows('kiosks', (query) => query.or(`status.eq.expired,end_date.lt.${todayDate}`)),
      getKioskRevenueInRange(monthStart, nextMonthStart),
      getKioskRevenueInRange(yearStart, nextYearStart),
      getCategoryDistribution(),
      getExpiringKiosks(),
      getRecentCustomers(),
    ]);

    return {
      summary: {
        totalCustomers,
        totalKiosks,
        activeKiosks,
        expiredKiosks,
        revenueThisMonth: sumKioskRevenue(monthKioskRevenue, 'total_paid'),
        revenueThisYear: sumKioskRevenue(yearKioskRevenue, 'kiosk_total_paid'),
      },
      charts: {
        monthlyRevenue: buildMonthlyRevenueSeries(yearKioskRevenue),
        categoryDistribution,
      },
      lists: {
        expiringKiosks,
        recentCustomers,
      },
      year,
    };
  },
};

async function countRows(tableName, applyFilters) {
  const supabase = requireSupabaseClient();
  let query = supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true });

  if (applyFilters) query = applyFilters(query);

  const { count } = await runQuery(query);
  return count || 0;
}

async function getKioskRevenueInRange(startDate, endDate) {
  const supabase = requireSupabaseClient();
  const { data } = await runQuery(
    supabase
      .from('kiosks')
      .select('total_paid, kiosk_total_paid, start_date')
      .gte('start_date', toDateOnly(startDate))
      .lt('start_date', toDateOnly(endDate)),
  );

  return data || [];
}

async function getCategoryDistribution() {
  const supabase = requireSupabaseClient();
  const { data } = await runQuery(
    supabase
      .from('kiosks')
      .select('id, categories(name)'),
  );

  const counts = new Map();
  for (const kiosk of data || []) {
    const name = kiosk.categories?.name || 'Chưa phân loại';
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

async function getExpiringKiosks(limit = 24) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const supabase = requireSupabaseClient();
  const { data } = await runQuery(
    supabase
      .from('kiosks')
      .select('id, facebook_name, end_date, customers(facebook_name, phone)')
      .in('status', ['active', 'warning'])
      .gte('end_date', toDateOnly(today))
      .lte('end_date', toDateOnly(thirtyDaysFromNow))
      .order('end_date', { ascending: true })
      .limit(limit),
  );

  return data || [];
}

async function getRecentCustomers(limit = 5) {
  const supabase = requireSupabaseClient();
  const { data } = await runQuery(
    supabase
      .from('customers')
      .select('id, facebook_name, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  );

  return data || [];
}

function sumKioskRevenue(kiosks, field) {
  return kiosks.reduce((total, kiosk) => total + Number(kiosk[field] || 0), 0);
}

function buildMonthlyRevenueSeries(kiosks) {
  const series = Array.from({ length: 12 }, (_, index) => ({
    month: index,
    total: 0,
  }));

  for (const kiosk of kiosks) {
    const month = Number(String(kiosk.start_date || '').slice(5, 7)) - 1;
    if (series[month]) {
      series[month].total += Number(kiosk.total_paid || 0);
    }
  }

  return series;
}
