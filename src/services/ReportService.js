import { requireSupabaseClient, runQuery } from './BaseService.js';
import { startOfToday, toDateOnly } from '../utils/date.js';

const REPORT_PAGE_SIZE = 1000;
const MAX_REPORT_ROWS = 20000;
const EXPIRING_WINDOW_DAYS = 30;
const PAYMENT_FIELDS = `
  id,
  customer_id,
  kiosk_id,
  created_at,
  start_date,
  end_date,
  months,
  price_per_month,
  discount,
  total_amount,
  payment_method,
  payment_status,
  confirmed_by,
  customers(facebook_name, phone)
`;
const PAYMENT_KIOSK_FIELDS = `
    id,
    facebook_name,
    facebook_id,
    status,
    end_date,
    category_id,
    business_type_id,
    categories(name),
    business_types(id, name, category_id, price_per_month)
`;
const KIOSK_SELECT = `
  id,
  customer_id,
  facebook_name,
  facebook_id,
  start_date,
  end_date,
  status,
  auto_approve,
  total_paid,
  category_id,
  business_type_id,
  customers(facebook_name, phone),
  categories(name),
  business_types(id, name, price_per_month)
`;

export const ReportService = {
  async getReportData(filters = {}) {
    const normalizedFilters = normalizeFilters(filters);
    const supabase = requireSupabaseClient();
    const [payments, kiosks] = await Promise.all([
      getPayments(supabase, normalizedFilters),
      getKiosks(supabase, normalizedFilters),
    ]);

    return {
      data: buildReportData(payments, kiosks, normalizedFilters),
    };
  },
};

async function getPayments(supabase, filters) {
  const requiresKiosk = Boolean(filters.categoryId || filters.businessTypeId);

  return fetchReportRows((from, to) => {
    let query = supabase
      .from('payments')
      .select(paymentSelect(requiresKiosk))
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.startDate) query = query.gte('start_date', filters.startDate);
    if (filters.endDate) query = query.lte('start_date', filters.endDate);
    if (filters.categoryId) query = query.eq('kiosks.category_id', filters.categoryId);
    if (filters.businessTypeId) query = query.eq('kiosks.business_type_id', filters.businessTypeId);

    return query;
  });
}

function paymentSelect(requiresKiosk) {
  const relation = requiresKiosk ? 'kiosks!inner' : 'kiosks';
  return `${PAYMENT_FIELDS}, ${relation}(${PAYMENT_KIOSK_FIELDS})`;
}

async function getKiosks(supabase, filters) {
  return fetchReportRows((from, to) => {
    let query = supabase
      .from('kiosks')
      .select(KIOSK_SELECT)
      .order('end_date', { ascending: true })
      .range(from, to);

    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.businessTypeId) query = query.eq('business_type_id', filters.businessTypeId);

    return query;
  });
}

async function fetchReportRows(buildQuery) {
  const rows = [];

  while (rows.length < MAX_REPORT_ROWS) {
    const from = rows.length;
    const to = Math.min(from + REPORT_PAGE_SIZE - 1, MAX_REPORT_ROWS - 1);
    const { data } = await runQuery(buildQuery(from, to));
    const batch = data || [];
    rows.push(...batch);

    if (batch.length < REPORT_PAGE_SIZE) break;
  }

  return rows;
}

function buildReportData(payments, kiosks, filters) {
  const completedPayments = payments.filter((payment) => normalizeStatus(payment.payment_status) === 'completed');
  const pendingPayments = payments.filter((payment) => normalizeStatus(payment.payment_status) === 'pending');
  const reconciliationRows = buildReconciliationRows(payments);
  const kioskRows = buildKioskRows(kiosks);

  return {
    filters,
    generatedAt: new Date().toISOString(),
    summary: {
      totalRevenue: sumAmounts(completedPayments),
      completedCount: completedPayments.length,
      pendingAmount: sumAmounts(pendingPayments),
      pendingCount: pendingPayments.length,
      rejectedCount: payments.filter((payment) => normalizeStatus(payment.payment_status) === 'rejected').length,
      cancelledCount: payments.filter((payment) => normalizeStatus(payment.payment_status) === 'cancelled').length,
      issueCount: reconciliationRows.filter((row) => row.issueLevel === 'warning').length,
      ...buildKioskSummary(kioskRows),
    },
    revenueByMonth: buildRevenueByMonth(completedPayments),
    revenueByBusinessType: buildRevenueByBusinessType(completedPayments),
    revenueByPaymentMethod: buildRevenueByPaymentMethod(completedPayments),
    topCustomers: buildTopCustomers(completedPayments),
    kioskStatusRows: buildKioskStatusRows(kioskRows),
    kioskRows,
    reconciliationRows,
  };
}

function buildRevenueByMonth(payments) {
  const rows = new Map();

  payments.forEach((payment) => {
    const key = String(payment.start_date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const [year, month] = key.split('-');
    const row = rows.get(key) || {
      key,
      label: `Tháng ${month}/${year}`,
      paymentCount: 0,
      totalAmount: 0,
    };

    row.paymentCount += 1;
    row.totalAmount += Number(payment.total_amount || 0);
    rows.set(key, row);
  });

  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function buildRevenueByBusinessType(payments) {
  const rows = new Map();

  payments.forEach((payment) => {
    const businessType = payment.kiosks?.business_types;
    const key = businessType?.id || 'unknown';
    const row = rows.get(key) || {
      businessTypeId: businessType?.id || '',
      businessTypeName: businessType?.name || 'Chưa phân loại',
      categoryName: payment.kiosks?.categories?.name || 'Chưa phân loại',
      paymentCount: 0,
      totalAmount: 0,
    };

    row.paymentCount += 1;
    row.totalAmount += Number(payment.total_amount || 0);
    rows.set(key, row);
  });

  return [...rows.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

function buildRevenueByPaymentMethod(payments) {
  const rows = new Map();

  payments.forEach((payment) => {
    const key = payment.payment_method || 'unknown';
    const row = rows.get(key) || {
      paymentMethod: paymentMethodLabel(key),
      paymentCount: 0,
      totalAmount: 0,
    };

    row.paymentCount += 1;
    row.totalAmount += Number(payment.total_amount || 0);
    rows.set(key, row);
  });

  return [...rows.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

function buildTopCustomers(payments) {
  const rows = new Map();

  payments.forEach((payment) => {
    const key = payment.customer_id || 'unknown';
    const row = rows.get(key) || {
      customerId: payment.customer_id || '',
      customerName: payment.customers?.facebook_name || 'Không tên',
      phone: payment.customers?.phone || '',
      paymentCount: 0,
      totalAmount: 0,
    };

    row.paymentCount += 1;
    row.totalAmount += Number(payment.total_amount || 0);
    rows.set(key, row);
  });

  return [...rows.values()]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10);
}

function buildKioskRows(kiosks) {
  return kiosks.map((kiosk) => ({
    id: kiosk.id,
    facebookName: kiosk.facebook_name || 'Không tên',
    facebookId: kiosk.facebook_id || '',
    customerName: kiosk.customers?.facebook_name || '',
    phone: kiosk.customers?.phone || '',
    categoryName: kiosk.categories?.name || 'Chưa phân loại',
    businessTypeName: kiosk.business_types?.name || 'Chưa phân loại',
    status: normalizeStatus(kiosk.status),
    derivedStatus: deriveKioskStatus(kiosk),
    startDate: kiosk.start_date || '',
    endDate: kiosk.end_date || '',
    totalPaid: Number(kiosk.total_paid || 0),
    autoApprove: Boolean(kiosk.auto_approve),
    daysLeft: daysUntilDate(kiosk.end_date),
  }));
}

function buildKioskSummary(kioskRows) {
  return {
    totalKiosks: kioskRows.length,
    activeKiosks: kioskRows.filter((kiosk) => kiosk.derivedStatus === 'active').length,
    warningKiosks: kioskRows.filter((kiosk) => kiosk.derivedStatus === 'warning').length,
    expiredKiosks: kioskRows.filter((kiosk) => kiosk.derivedStatus === 'expired').length,
    pendingKiosks: kioskRows.filter((kiosk) => kiosk.derivedStatus === 'pending').length,
  };
}

function buildKioskStatusRows(kioskRows) {
  const labels = {
    active: 'Hoạt động',
    warning: 'Sắp hết hạn',
    expired: 'Hết hạn',
    pending: 'Chờ duyệt',
    inactive: 'Không hoạt động',
    suspended: 'Tạm ngưng',
  };
  const rows = new Map();

  kioskRows.forEach((kiosk) => {
    const status = kiosk.derivedStatus || 'unknown';
    const row = rows.get(status) || {
      status,
      label: labels[status] || status,
      kioskCount: 0,
      totalPaid: 0,
    };

    row.kioskCount += 1;
    row.totalPaid += Number(kiosk.totalPaid || 0);
    rows.set(status, row);
  });

  return [...rows.values()].sort((a, b) => b.kioskCount - a.kioskCount);
}

function buildReconciliationRows(payments) {
  const rows = [];

  payments.forEach((payment) => {
    const status = normalizeStatus(payment.payment_status);
    const amount = Number(payment.total_amount || 0);
    const baseRow = {
      paymentId: payment.id,
      customerId: payment.customer_id,
      kioskId: payment.kiosk_id,
      customerName: payment.customers?.facebook_name || 'Không tên',
      kioskName: payment.kiosks?.facebook_name || 'Không tên',
      businessTypeName: payment.kiosks?.business_types?.name || 'Chưa phân loại',
      paymentStatus: status,
      paymentMethod: paymentMethodLabel(payment.payment_method || ''),
      totalAmount: amount,
      createdAt: payment.created_at,
      confirmedBy: payment.confirmed_by || '',
      issueLevel: 'info',
      issue: '',
    };

    if (!payment.kiosk_id || !payment.kiosks) {
      rows.push({ ...baseRow, issue: 'Thiếu liên kết Kiosk', issueLevel: 'warning' });
    }

    if (status === 'pending') {
      rows.push({ ...baseRow, issue: 'Chờ xác nhận thanh toán', issueLevel: 'info' });
      return;
    }

    if (status === 'completed' && amount <= 0) {
      rows.push({ ...baseRow, issue: 'Đã hoàn thành nhưng tổng tiền bằng 0', issueLevel: 'warning' });
    }

    if (status === 'completed' && !payment.payment_method) {
      rows.push({ ...baseRow, issue: 'Thiếu phương thức thanh toán', issueLevel: 'warning' });
    }

    if (status === 'completed' && !payment.confirmed_by) {
      rows.push({ ...baseRow, issue: 'Thiếu người xác nhận', issueLevel: 'warning' });
    }

    if (status === 'rejected' || status === 'cancelled') {
      rows.push({ ...baseRow, issue: status === 'rejected' ? 'Thanh toán bị từ chối' : 'Thanh toán đã hủy', issueLevel: 'info' });
    }
  });

  return rows.sort((a, b) => {
    if (a.issueLevel !== b.issueLevel) return a.issueLevel === 'warning' ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function sumAmounts(rows) {
  return rows.reduce((total, row) => total + Number(row.total_amount || 0), 0);
}

function deriveKioskStatus(kiosk) {
  const status = normalizeStatus(kiosk.status);
  if (status === 'expired' || isPastDate(kiosk.end_date)) return 'expired';
  if (status === 'active' && isExpiringSoon(kiosk.end_date)) return 'warning';
  return status || 'unknown';
}

function isPastDate(value) {
  if (!value) return false;
  return String(value) < toDateOnly(startOfToday());
}

function isExpiringSoon(value) {
  if (!value) return false;
  const today = startOfToday();
  const todayDate = toDateOnly(today);
  const warningEnd = new Date(today);
  warningEnd.setDate(today.getDate() + EXPIRING_WINDOW_DAYS);
  return String(value) >= todayDate && String(value) <= toDateOnly(warningEnd);
}

function daysUntilDate(value) {
  if (!value) return null;
  const today = startOfToday();
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  const target = new Date(year, month - 1, day);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function normalizeFilters(filters) {
  return {
    startDate: normalizeDateString(filters.startDate),
    endDate: normalizeDateString(filters.endDate),
    categoryId: String(filters.categoryId || '').trim(),
    businessTypeId: String(filters.businessTypeId || '').trim(),
  };
}

function normalizeDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase();
}

function paymentMethodLabel(value) {
  const normalized = String(value || '').toLowerCase();
  const labels = {
    transfer: 'Chuyển khoản',
    bank_transfer: 'Chuyển khoản NH',
    cash: 'Tiền mặt',
    momo: 'Momo',
    import_excel: 'Dữ liệu nhập từ Excel',
    unknown: 'Không rõ',
    '': 'Không rõ',
  };

  return labels[normalized] || value || 'Không rõ';
}
