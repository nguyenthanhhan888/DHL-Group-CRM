import { applyPagination, applySort, requireSupabaseClient, runQuery } from './BaseService.js';
import { addMonths, parseDateOnly, startOfToday, toDateOnly } from '../utils/date.js';

const PAYMENT_SELECT = '*, customers(facebook_name, phone), kiosks(facebook_name, facebook_id, business_type_id, business_types(name))';
const PAYMENT_SUMMARY_SELECT = 'total_amount, payment_status, payment_method, created_at, customer_id, kiosk_id';

export const PaymentService = {
  calculateRenewalPreview(kiosk, { months = 1, discount = 0 } = {}) {
    return buildRenewalPreview(kiosk, { months, discount });
  },

  async renewKiosk({
    kioskId,
    months = 1,
    discount = 0,
    discountReason = '',
    note = '',
  } = {}) {
    const supabase = requireSupabaseClient();
    const kiosk = await getRenewalKiosk(supabase, kioskId);
    const renewal = buildRenewalPreview(kiosk, { months, discount });
    const paymentPayload = {
      customer_id: kiosk.customer_id,
      kiosk_id: kiosk.id,
      start_date: renewal.startDate,
      end_date: renewal.endDate,
      months: renewal.months,
      price_per_month: renewal.pricePerMonth,
      discount: renewal.discount,
      discount_reason: normalizeOptionalText(discountReason),
      total_amount: renewal.totalAmount,
      payment_method: 'transfer',
      payment_status: 'pending',
      note: normalizeOptionalText(note),
    };

    const { data: payment } = await runQuery(
      supabase
        .from('payments')
        .insert([paymentPayload])
        .select()
        .single(),
    );

    await PaymentService.confirm(payment.id);
    return { data: { payment, renewal } };
  },

  async list({
    searchTerm = '',
    status = '',
    paymentMethod = '',
    businessTypeId = '',
    sort = { column: 'created_at', ascending: false },
    pagination,
  } = {}) {
    const supabase = requireSupabaseClient();
    const [searchContext, businessTypeKioskIds] = await Promise.all([
      buildSearchContext(supabase, searchTerm),
      findKioskIdsByBusinessType(supabase, businessTypeId),
    ]);
    let query = supabase
      .from('payments')
      .select(PAYMENT_SELECT, { count: 'exact' });

    query = applyPaymentFilters(query, {
      searchContext,
      status,
      paymentMethod,
      businessTypeKioskIds,
    });

    return runQuery(applyPagination(applySort(query, sort), pagination));
  },

  async listWithSummary({
    searchTerm = '',
    status = '',
    paymentMethod = '',
    businessTypeId = '',
    sort = { column: 'created_at', ascending: false },
    pagination,
  } = {}) {
    const supabase = requireSupabaseClient();
    const [searchContext, businessTypeKioskIds] = await Promise.all([
      buildSearchContext(supabase, searchTerm),
      findKioskIdsByBusinessType(supabase, businessTypeId),
    ]);
    const filters = {
      searchContext,
      status,
      paymentMethod,
      businessTypeKioskIds,
    };

    let listQuery = supabase
      .from('payments')
      .select(PAYMENT_SELECT, { count: 'exact' });
    let summaryQuery = supabase
      .from('payments')
      .select(PAYMENT_SUMMARY_SELECT);

    listQuery = applyPaymentFilters(listQuery, filters);
    summaryQuery = applyPaymentFilters(summaryQuery, filters);

    const [listResult, summaryResult] = await Promise.all([
      runQuery(applyPagination(applySort(listQuery, sort), pagination)),
      runQuery(summaryQuery),
    ]);

    return {
      data: listResult.data,
      count: listResult.count,
      summary: buildPaymentSummary(summaryResult.data || []),
    };
  },

  async getSummary({
    searchTerm = '',
    status = '',
    paymentMethod = '',
    businessTypeId = '',
  } = {}) {
    const supabase = requireSupabaseClient();
    const [searchContext, businessTypeKioskIds] = await Promise.all([
      buildSearchContext(supabase, searchTerm),
      findKioskIdsByBusinessType(supabase, businessTypeId),
    ]);
    let query = supabase
      .from('payments')
      .select(PAYMENT_SUMMARY_SELECT);

    query = applyPaymentFilters(query, {
      searchContext,
      status,
      paymentMethod,
      businessTypeKioskIds,
    });

    const { data } = await runQuery(query);
    return { data: buildPaymentSummary(data || []) };
  },

  async listPending() {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: true }),
    );
  },

  async listByKiosk(kioskId) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('payments')
        .select('id, created_at, start_date, end_date, months, price_per_month, discount, total_amount, payment_method, payment_status, note')
        .eq('kiosk_id', kioskId)
        .order('created_at', { ascending: false }),
    );
  },

  async getById(id) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('payments')
        .select('*, customers(*), kiosks(*)')
        .eq('id', id)
        .single(),
    );
  },

  async create(payment) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('payments')
        .insert([payment])
        .select()
        .single(),
    );
  },

  async updatePending(id, payment) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('payments')
        .update(payment)
        .eq('id', id)
        .eq('payment_status', 'pending')
        .select()
        .single(),
    );
  },

  async confirm(id) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase.rpc('confirm_payment', { payment_id_input: id }),
    );
  },

  async cancelRegistration(id) {
    const supabase = requireSupabaseClient();
    const { data: payment } = await runQuery(
      supabase
        .from('payments')
        .update({ payment_status: 'cancelled' })
        .eq('id', id)
        .eq('payment_status', 'pending')
        .select('id, customer_id, kiosk_id, customers(status), kiosks(status)')
        .single(),
    );

    try {
      await updatePendingRegistrationRecords(supabase, payment, 'inactive');
      return { data: payment };
    } catch (error) {
      await Promise.allSettled([
        updatePendingRegistrationRecords(supabase, payment, 'pending', 'inactive'),
        runQuery(
          supabase
            .from('payments')
            .update({ payment_status: 'pending' })
            .eq('id', id)
            .eq('payment_status', 'cancelled'),
        ),
      ]);
      throw error;
    }
  },

  async reject(id) {
    const supabase = requireSupabaseClient();
    return runQuery(
      supabase
        .from('payments')
        .update({ payment_status: 'rejected' })
        .eq('id', id)
        .eq('payment_status', 'pending')
        .select()
        .single(),
    );
  },
};

async function updatePendingRegistrationRecords(supabase, payment, nextStatus, currentStatus = 'pending') {
  const updates = [];

  if (payment.kiosk_id && payment.kiosks?.status === 'pending') {
    updates.push(runQuery(
      supabase
        .from('kiosks')
        .update({ status: nextStatus })
        .eq('id', payment.kiosk_id)
        .eq('status', currentStatus),
    ));
  }

  if (payment.customer_id && payment.customers?.status === 'pending') {
    updates.push(runQuery(
      supabase
        .from('customers')
        .update({ status: nextStatus })
        .eq('id', payment.customer_id)
        .eq('status', currentStatus),
    ));
  }

  const results = await Promise.allSettled(updates);
  const failedUpdate = results.find((result) => result.status === 'rejected');
  if (failedUpdate) throw failedUpdate.reason;
}

async function getRenewalKiosk(supabase, kioskId) {
  if (!kioskId) {
    throw new Error('Kiosk là bắt buộc để gia hạn.');
  }

  const { data, error } = await supabase
    .from('kiosks')
    .select('id, customer_id, facebook_name, facebook_id, start_date, end_date, business_types(name, price_per_month)')
    .eq('id', kioskId)
    .single();

  if (error) throw error;
  if (!data?.customer_id) {
    throw new Error('Kiosk thiếu customer_id.');
  }

  return data;
}

function buildRenewalPreview(kiosk, { months = 1, discount = 0 } = {}) {
  if (!kiosk) {
    throw new Error('Kiosk là bắt buộc để gia hạn.');
  }

  if (!kiosk.business_types) {
    throw new Error('Kiosk thiếu loại hình kinh doanh.');
  }

  const normalizedMonths = Number(months);
  const normalizedDiscount = Math.max(Number(discount || 0), 0);
  const pricePerMonth = Number(kiosk.business_types.price_per_month);

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    throw new Error('Số tháng phải là số nguyên lớn hơn 0.');
  }

  if (!Number.isFinite(pricePerMonth)) {
    throw new Error('Giá loại hình kinh doanh không hợp lệ.');
  }

  const start = nextRenewalStartDate(kiosk.end_date);
  const end = addMonths(start, normalizedMonths);
  const subtotal = pricePerMonth * normalizedMonths;

  return {
    businessTypeName: kiosk.business_types.name || '',
    months: normalizedMonths,
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    pricePerMonth,
    discount: normalizedDiscount,
    subtotal,
    totalAmount: Math.max(subtotal - normalizedDiscount, 0),
  };
}

function nextRenewalStartDate(endDate) {
  if (!endDate) {
    return startOfToday();
  }

  const date = parseDateOnly(endDate);
  date.setDate(date.getDate() + 1);
  return date;
}

function normalizeOptionalText(value) {
  return String(value || '').trim() || null;
}

async function buildSearchContext(supabase, searchTerm) {
  const normalizedSearch = normalizeSearchTerm(searchTerm);
  if (!normalizedSearch) {
    return { searchTerm: '' };
  }

  const businessTypeIds = await findBusinessTypeIds(supabase, normalizedSearch);
  const [customerIds, kioskIds] = await Promise.all([
    findCustomerIds(supabase, normalizedSearch),
    findKioskIds(supabase, normalizedSearch, businessTypeIds),
  ]);

  return {
    searchTerm: normalizedSearch,
    customerIds,
    kioskIds,
  };
}

function applyPaymentFilters(query, {
  searchContext,
  status = '',
  paymentMethod = '',
  businessTypeKioskIds = null,
}) {
  if (status) query = query.eq('payment_status', status);
  if (paymentMethod) query = query.eq('payment_method', paymentMethod);
  if (Array.isArray(businessTypeKioskIds)) {
    query = businessTypeKioskIds.length
      ? query.in('kiosk_id', businessTypeKioskIds)
      : query.eq('kiosk_id', -1);
  }

  if (searchContext?.searchTerm) {
    query = query.or(buildSearchFilter(searchContext));
  }

  return query;
}

function buildPaymentSummary(payments) {
  const currentMonth = new Date();
  const summary = {
    totalRevenue: 0,
    monthRevenue: 0,
    transferRevenue: 0,
    pendingCount: 0,
  };

  payments.forEach((payment) => {
    const status = String(payment.payment_status || '').toLowerCase();
    const amount = Number(payment.total_amount || 0);

    if (status === 'pending') {
      summary.pendingCount += 1;
    }

    if (status !== 'completed') return;

    summary.totalRevenue += amount;

    if (isSameMonth(payment.created_at, currentMonth)) {
      summary.monthRevenue += amount;
    }

    if (isTransferMethod(payment.payment_method)) {
      summary.transferRevenue += amount;
    }
  });

  return summary;
}

function buildSearchFilter({ searchTerm, customerIds = [], kioskIds = [] }) {
  const pattern = `%${searchTerm}%`;
  const conditions = [
    `payment_status.ilike.${pattern}`,
    `payment_method.ilike.${pattern}`,
    `discount_reason.ilike.${pattern}`,
    `note.ilike.${pattern}`,
  ];

  if (customerIds.length) {
    conditions.push(`customer_id.in.(${customerIds.join(',')})`);
  }

  if (kioskIds.length) {
    conditions.push(`kiosk_id.in.(${kioskIds.join(',')})`);
  }

  return conditions.join(',');
}

async function findCustomerIds(supabase, searchTerm) {
  const pattern = `%${searchTerm}%`;
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .or(`facebook_name.ilike.${pattern},facebook_id.ilike.${pattern},phone.ilike.${pattern}`)
    .limit(100);

  if (error) throw error;
  return (data || []).map((item) => item.id).filter(Boolean);
}

async function findBusinessTypeIds(supabase, searchTerm) {
  const { data, error } = await supabase
    .from('business_types')
    .select('id')
    .ilike('name', `%${searchTerm}%`)
    .limit(100);

  if (error) throw error;
  return (data || []).map((item) => item.id).filter(Boolean);
}

async function findKioskIds(supabase, searchTerm, businessTypeIds = []) {
  const pattern = `%${searchTerm}%`;
  const conditions = [
    `facebook_name.ilike.${pattern}`,
    `facebook_id.ilike.${pattern}`,
  ];

  if (businessTypeIds.length) {
    conditions.push(`business_type_id.in.(${businessTypeIds.join(',')})`);
  }

  const { data, error } = await supabase
    .from('kiosks')
    .select('id')
    .or(conditions.join(','))
    .limit(1000);

  if (error) throw error;
  return (data || []).map((item) => item.id).filter(Boolean);
}

async function findKioskIdsByBusinessType(supabase, businessTypeId) {
  if (!businessTypeId) return null;

  const { data, error } = await supabase
    .from('kiosks')
    .select('id')
    .eq('business_type_id', businessTypeId)
    .limit(1000);

  if (error) throw error;
  return (data || []).map((item) => item.id).filter(Boolean);
}

function normalizeSearchTerm(value) {
  return String(value || '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSameMonth(value, target) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function isTransferMethod(value) {
  return ['transfer', 'bank_transfer', 'chuyen_khoan', 'chuyển khoản'].includes(String(value || '').toLowerCase());
}
