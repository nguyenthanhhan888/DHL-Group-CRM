import { BusinessTypeService } from './BusinessTypeService.js';
import { CustomerService } from './CustomerService.js';
import { KioskService } from './KioskService.js';
import { PaymentService } from './PaymentService.js';
import { addMonths, startOfToday, toDateOnly } from '../utils/date.js';
import { buildFacebookGroupMemberUrl } from '../constants/facebook.js';
import { requireSupabaseClient, runQuery } from './BaseService.js';

const DEFAULT_PAYMENT_METHOD = 'transfer';

export const RegistrationService = {
  calculatePreview(businessType, { months = 1, discount = 0 } = {}) {
    return buildRegistrationPreview(businessType, { months, discount });
  },

  async submit({
    customer,
    businessTypeId,
    months = 1,
    discount = 0,
    discountReason = '',
  } = {}) {
    if (!customer) {
      throw new Error('Thông tin khách hàng là bắt buộc.');
    }

    if (!businessTypeId) {
      throw new Error('Loại hình kinh doanh là bắt buộc.');
    }

    const { data: businessType } = await BusinessTypeService.getById(businessTypeId);
    if (!businessType?.is_active) {
      throw new Error('Loại hình kinh doanh không hoạt động.');
    }

    const preview = buildRegistrationPreview(businessType, { months, discount });
    const normalizedDiscountReason = normalizeDiscountReason(preview.discount, discountReason);
    const { data: requestId } = await runQuery(requireSupabaseClient().rpc('submit_registration_request', {
      facebook_name_input: normalizeRequiredText(customer.facebook_name, 'Tên Facebook'),
      phone_input: normalizeRequiredText(customer.phone, 'Số điện thoại'),
      facebook_id_input: normalizeOptionalText(customer.facebook_id),
      facebook_link_input: normalizeOptionalText(customer.facebook_link),
      address_input: normalizeOptionalText(customer.address),
      note_input: normalizeOptionalText(customer.note),
      category_id_input: businessType.category_id,
      business_type_id_input: businessType.id,
      months_input: preview.months,
      discount_input: preview.discount,
      discount_reason_input: normalizedDiscountReason,
    }));

    return {
      data: {
        requestId,
        preview,
        businessType,
        facebookName: customer.facebook_name,
      },
    };
  },

  async submitExistingCustomerKiosk({
    customerId,
    kiosk,
    businessTypeId,
    months = 1,
    discount = 0,
    discountReason = '',
  } = {}) {
    if (!customerId) {
      throw new Error('Khách hàng là bắt buộc.');
    }

    if (!kiosk) {
      throw new Error('Thông tin Kiosk là bắt buộc.');
    }

    if (!businessTypeId) {
      throw new Error('Loại hình kinh doanh là bắt buộc.');
    }

    const [{ data: customer }, { data: businessType }] = await Promise.all([
      CustomerService.getById(customerId),
      BusinessTypeService.getById(businessTypeId),
    ]);

    if (!customer?.id) {
      throw new Error('Khách hàng không tồn tại.');
    }

    if (!businessType?.is_active) {
      throw new Error('Loại hình kinh doanh không hoạt động.');
    }

    const preview = buildRegistrationPreview(businessType, { months, discount });
    const normalizedDiscountReason = normalizeDiscountReason(preview.discount, discountReason);
    const facebookId = normalizeOptionalText(kiosk.facebook_id);
    const { data: createdKiosk } = await KioskService.create({
      customer_id: customer.id,
      facebook_name: normalizeRequiredText(kiosk.facebook_name, 'Tên Facebook'),
      facebook_id: facebookId,
      facebook_link: normalizeOptionalText(kiosk.facebook_link),
      facebook_group_link: buildFacebookGroupMemberUrl(facebookId),
      category_id: businessType.category_id,
      business_type_id: businessType.id,
      start_date: preview.startDate,
      end_date: preview.endDate,
      status: 'pending',
      auto_approve: false,
      note: normalizeOptionalText(kiosk.note),
    });

    const { data: payment } = await PaymentService.create({
      customer_id: customer.id,
      kiosk_id: createdKiosk.id,
      start_date: preview.startDate,
      end_date: preview.endDate,
      months: preview.months,
      price_per_month: preview.pricePerMonth,
      discount: preview.discount,
      discount_reason: normalizedDiscountReason,
      total_amount: preview.totalAmount,
      payment_method: DEFAULT_PAYMENT_METHOD,
      payment_status: 'pending',
      note: normalizeOptionalText(kiosk.note),
    });

    return {
      data: {
        customer,
        kiosk: createdKiosk,
        payment,
        preview,
        businessType,
      },
    };
  },
};

function buildRegistrationPreview(businessType, { months = 1, discount = 0 } = {}) {
  if (!businessType) {
    throw new Error('Cần chọn loại hình kinh doanh để tính giá.');
  }

  const normalizedMonths = Number(months);
  const pricePerMonth = Number(businessType.price_per_month);
  const normalizedDiscount = Number(discount || 0);

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    throw new Error('Số tháng phải là số nguyên lớn hơn 0.');
  }

  if (!Number.isFinite(pricePerMonth) || pricePerMonth < 0) {
    throw new Error('Giá loại hình kinh doanh không hợp lệ.');
  }

  if (!Number.isFinite(normalizedDiscount) || normalizedDiscount < 0) {
    throw new Error('Giảm giá phải là số lớn hơn hoặc bằng 0.');
  }

  const start = startOfToday();
  const end = addMonths(start, normalizedMonths);
  const subtotal = pricePerMonth * normalizedMonths;
  if (normalizedDiscount > subtotal) {
    throw new Error('Giảm giá không được lớn hơn tạm tính.');
  }

  return {
    businessTypeName: businessType.name || '',
    categoryId: businessType.category_id || '',
    months: normalizedMonths,
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    pricePerMonth,
    subtotal,
    discount: normalizedDiscount,
    totalAmount: subtotal - normalizedDiscount,
  };
}

function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`${label} là bắt buộc.`);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  return String(value || '').trim() || null;
}

function normalizeDiscountReason(discount, reason) {
  const normalizedReason = normalizeOptionalText(reason);
  if (Number(discount || 0) > 0 && !normalizedReason) {
    throw new Error('Cần nhập lý do khi áp dụng giảm giá.');
  }
  return normalizedReason;
}
