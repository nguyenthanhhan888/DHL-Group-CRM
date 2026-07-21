import { BusinessTypeService } from './BusinessTypeService.js';
import { CustomerService } from './CustomerService.js';
import { KioskService } from './KioskService.js';
import { PaymentService } from './PaymentService.js';
import { addMonths, startOfToday, toDateOnly } from '../utils/date.js';

const DEFAULT_PAYMENT_METHOD = 'transfer';

export const RegistrationService = {
  calculatePreview(businessType, { months = 1 } = {}) {
    return buildRegistrationPreview(businessType, { months });
  },

  async submit({
    customer,
    businessTypeId,
    months = 1,
    paymentMethod = DEFAULT_PAYMENT_METHOD,
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

    const preview = buildRegistrationPreview(businessType, { months });
    const { data: createdCustomer } = await CustomerService.create({
      facebook_name: normalizeRequiredText(customer.facebook_name, 'Tên Facebook'),
      facebook_id: normalizeOptionalText(customer.facebook_id),
      facebook_link: normalizeOptionalText(customer.facebook_link),
      facebook_group_link: normalizeOptionalText(customer.facebook_group_link),
      phone: normalizeRequiredText(customer.phone, 'Số điện thoại'),
      address: normalizeOptionalText(customer.address),
      status: 'pending',
      note: normalizeOptionalText(customer.note),
    });

    const { data: kiosk } = await KioskService.create({
      customer_id: createdCustomer.id,
      facebook_name: normalizeRequiredText(customer.facebook_name, 'Tên Facebook'),
      facebook_id: normalizeOptionalText(customer.facebook_id),
      category_id: businessType.category_id,
      business_type_id: businessType.id,
      start_date: preview.startDate,
      end_date: preview.endDate,
      status: 'pending',
      auto_approve: false,
      note: normalizeOptionalText(customer.note),
    });

    const { data: payment } = await PaymentService.create({
      customer_id: createdCustomer.id,
      kiosk_id: kiosk.id,
      start_date: preview.startDate,
      end_date: preview.endDate,
      months: preview.months,
      price_per_month: preview.pricePerMonth,
      discount: 0,
      discount_reason: null,
      total_amount: preview.totalAmount,
      payment_method: paymentMethod || DEFAULT_PAYMENT_METHOD,
      payment_status: 'pending',
      note: normalizeOptionalText(customer.note),
    });

    return {
      data: {
        customer: createdCustomer,
        kiosk,
        payment,
        preview,
        businessType,
      },
    };
  },

  async submitExistingCustomerKiosk({
    customerId,
    kiosk,
    businessTypeId,
    months = 1,
    paymentMethod = DEFAULT_PAYMENT_METHOD,
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

    const preview = buildRegistrationPreview(businessType, { months });
    const { data: createdKiosk } = await KioskService.create({
      customer_id: customer.id,
      facebook_name: normalizeRequiredText(kiosk.facebook_name, 'Tên Facebook'),
      facebook_id: normalizeOptionalText(kiosk.facebook_id),
      facebook_link: normalizeOptionalText(kiosk.facebook_link),
      facebook_group_link: normalizeOptionalText(kiosk.facebook_group_link),
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
      discount: 0,
      discount_reason: null,
      total_amount: preview.totalAmount,
      payment_method: paymentMethod || DEFAULT_PAYMENT_METHOD,
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

function buildRegistrationPreview(businessType, { months = 1 } = {}) {
  if (!businessType) {
    throw new Error('Cần chọn loại hình kinh doanh để tính giá.');
  }

  const normalizedMonths = Number(months);
  const pricePerMonth = Number(businessType.price_per_month);

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    throw new Error('Số tháng phải là số nguyên lớn hơn 0.');
  }

  if (!Number.isFinite(pricePerMonth) || pricePerMonth < 0) {
    throw new Error('Giá loại hình kinh doanh không hợp lệ.');
  }

  const start = startOfToday();
  const end = addMonths(start, normalizedMonths);
  const subtotal = pricePerMonth * normalizedMonths;

  return {
    businessTypeName: businessType.name || '',
    categoryId: businessType.category_id || '',
    months: normalizedMonths,
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    pricePerMonth,
    subtotal,
    discount: 0,
    totalAmount: subtotal,
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
