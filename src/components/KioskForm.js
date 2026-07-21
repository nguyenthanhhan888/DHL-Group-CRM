import { Modal } from './Modal.js';
import { Toast } from './Toast.js';
import { BusinessTypeService } from '../services/BusinessTypeService.js';
import { CustomerService } from '../services/CustomerService.js';
import { RegistrationService } from '../services/RegistrationService.js';
import { formatCurrency } from '../utils/currency.js';
import { debounce } from '../utils/dom.js';
import { escapeHtml } from '../utils/html.js';

const CUSTOMER_PAGE_SIZE = 50;
const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'bank_transfer', label: 'Chuyển khoản NH' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'momo', label: 'Momo' },
];

let customers = [];
let businessTypes = [];

export function openKioskForm({ onSaved } = {}) {
  customers = [];
  businessTypes = [];

  Modal.open({
    title: 'Thêm Kiosk',
    body: renderKioskForm(),
  });

  bindKioskForm(onSaved);
  loadInitialOptions();
}

function bindKioskForm(onSaved) {
  document.querySelector('[data-kiosk-cancel]')?.addEventListener('click', Modal.close);
  document.getElementById('add-kiosk-customer-search')?.addEventListener('input', debounce((event) => {
    loadCustomerOptions(event.target.value.trim());
  }, 300));

  document.getElementById('add-kiosk-customer')?.addEventListener('change', fillCustomerDefaults);
  document.getElementById('add-kiosk-business-type')?.addEventListener('change', updateKioskPreview);
  document.getElementById('add-kiosk-months')?.addEventListener('input', updateKioskPreview);

  document.getElementById('add-kiosk-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormError();

    const validation = validateKioskForm();
    if (!validation.valid) {
      showFormError(validation.message);
      return;
    }

    const saveButton = document.getElementById('add-kiosk-save-button');
    setSaving(saveButton, true);

    try {
      const result = await RegistrationService.submitExistingCustomerKiosk(readKioskPayload());
      Modal.close();
      Toast.show('Đã tạo kiosk chờ xác nhận thanh toán.');
      await onSaved?.(result.data);
    } catch (error) {
      showFormError(error?.message || 'Không thể tạo kiosk.');
    } finally {
      setSaving(saveButton, false);
    }
  });
}

function renderKioskForm() {
  return `
    <form id="add-kiosk-form" class="modal-form" novalidate>
      <div id="add-kiosk-form-error" class="form-error hidden"></div>

      <label class="form-group">
        <span>Tìm khách hàng</span>
        <input class="form-control" id="add-kiosk-customer-search" type="search" placeholder="Tên Facebook, SĐT, Facebook ID" autocomplete="off" />
      </label>

      <label class="form-group">
        <span>Khách hàng *</span>
        <select class="form-control" id="add-kiosk-customer" required disabled>
          <option value="">Đang tải khách hàng...</option>
        </select>
      </label>

      <label class="form-group">
        <span>Tên Facebook *</span>
        <input class="form-control" id="add-kiosk-facebook-name" type="text" autocomplete="off" required />
      </label>

      <div class="form-row">
        <label class="form-group">
          <span>Facebook ID</span>
          <input class="form-control" id="add-kiosk-facebook-id" type="text" autocomplete="off" />
        </label>
        <label class="form-group">
          <span>Số tháng *</span>
          <input class="form-control" id="add-kiosk-months" type="number" min="1" step="1" value="1" required />
        </label>
      </div>

      <label class="form-group">
        <span>Link Facebook</span>
        <input class="form-control" id="add-kiosk-facebook-link" type="url" autocomplete="off" />
      </label>

      <label class="form-group">
        <span>Link nhóm Facebook</span>
        <input class="form-control" id="add-kiosk-facebook-group-link" type="url" autocomplete="off" />
      </label>

      <label class="form-group">
        <span>Loại hình kinh doanh *</span>
        <select class="form-control" id="add-kiosk-business-type" required disabled>
          <option value="">Đang tải loại hình kinh doanh...</option>
        </select>
      </label>

      <label class="form-group">
        <span>Phương thức thanh toán</span>
        <select class="form-control" id="add-kiosk-payment-method">
          ${PAYMENT_METHODS.map((method) => `<option value="${method.value}">${method.label}</option>`).join('')}
        </select>
      </label>

      <label class="form-group">
        <span>Ghi chú</span>
        <textarea class="form-control" id="add-kiosk-note" rows="3"></textarea>
      </label>

      <div class="renew-calculation" id="add-kiosk-preview">
        ${renderPreviewState('Chọn loại hình kinh doanh để tính tiền.')}
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" type="button" data-kiosk-cancel>Hủy</button>
        <button class="btn-primary" id="add-kiosk-save-button" type="submit">Tạo Kiosk</button>
      </div>
    </form>
  `;
}

async function loadInitialOptions() {
  await Promise.all([
    loadCustomerOptions(''),
    loadBusinessTypeOptions(),
  ]);
  fillCustomerDefaults();
  updateKioskPreview();
}

async function loadCustomerOptions(searchTerm) {
  const select = document.getElementById('add-kiosk-customer');
  if (!select) return;

  select.disabled = true;
  select.innerHTML = '<option value="">Đang tải khách hàng...</option>';

  try {
    const { data } = await CustomerService.list({
      searchTerm,
      sort: { column: 'facebook_name', ascending: true },
      pagination: { page: 1, pageSize: CUSTOMER_PAGE_SIZE },
    });
    customers = data || [];
    renderCustomerOptions();
  } catch (error) {
    customers = [];
    select.innerHTML = '<option value="">Không tải được khách hàng</option>';
  } finally {
    select.disabled = false;
  }
}

async function loadBusinessTypeOptions() {
  const select = document.getElementById('add-kiosk-business-type');
  if (!select) return;

  select.disabled = true;
  select.innerHTML = '<option value="">Đang tải loại hình kinh doanh...</option>';

  try {
    const { data } = await BusinessTypeService.listActive();
    businessTypes = data || [];
    renderBusinessTypeOptions();
  } catch (error) {
    businessTypes = [];
    select.innerHTML = '<option value="">Không tải được loại hình kinh doanh</option>';
  } finally {
    select.disabled = false;
  }
}

function renderCustomerOptions() {
  const select = document.getElementById('add-kiosk-customer');
  if (!select) return;

  select.innerHTML = `
    <option value="">Chọn khách hàng</option>
    ${customers.map((customer) => `
      <option value="${escapeHtml(customer.id)}">
        ${escapeHtml(customer.facebook_name || 'Không tên')} · ${escapeHtml(customer.phone || 'Không SĐT')}
      </option>
    `).join('')}
  `;
}

function renderBusinessTypeOptions() {
  const select = document.getElementById('add-kiosk-business-type');
  if (!select) return;

  select.innerHTML = `
    <option value="">Chọn loại hình kinh doanh</option>
    ${businessTypes.map((businessType) => `
      <option value="${escapeHtml(businessType.id)}">
        ${escapeHtml(businessType.name || 'Không tên')} · ${formatCurrency(businessType.price_per_month || 0)}/tháng
      </option>
    `).join('')}
  `;
}

function fillCustomerDefaults() {
  const customer = selectedCustomer();
  if (!customer) return;

  fillIfEmpty('add-kiosk-facebook-name', customer.facebook_name);
  fillIfEmpty('add-kiosk-facebook-id', customer.facebook_id);
  fillIfEmpty('add-kiosk-facebook-link', customer.facebook_link);
  fillIfEmpty('add-kiosk-facebook-group-link', customer.facebook_group_link);
}

function updateKioskPreview() {
  const previewElement = document.getElementById('add-kiosk-preview');
  if (!previewElement) return;

  const businessType = selectedBusinessType();
  if (!businessType) {
    previewElement.innerHTML = renderPreviewState('Chọn loại hình kinh doanh để tính tiền.');
    return;
  }

  try {
    const preview = RegistrationService.calculatePreview(businessType, {
      months: readNumber('add-kiosk-months'),
    });

    previewElement.innerHTML = `
      <div class="setting-item">
        <span class="setting-name">Ngày bắt đầu</span>
        <span class="setting-value">${escapeHtml(preview.startDate)}</span>
      </div>
      <div class="setting-item">
        <span class="setting-name">Ngày hết hạn</span>
        <span class="setting-value">${escapeHtml(preview.endDate)}</span>
      </div>
      <div class="setting-item">
        <span class="setting-name">Giá/tháng</span>
        <span class="setting-value">${formatCurrency(preview.pricePerMonth)}</span>
      </div>
      <div class="setting-item">
        <span class="setting-name">Tổng tiền</span>
        <span class="setting-value">${formatCurrency(preview.totalAmount)}</span>
      </div>
    `;
  } catch (error) {
    previewElement.innerHTML = renderPreviewState(error?.message || 'Không thể tính tiền.');
  }
}

function renderPreviewState(message) {
  return `<div class="muted-text">${escapeHtml(message)}</div>`;
}

function readKioskPayload() {
  return {
    customerId: readValue('add-kiosk-customer'),
    businessTypeId: readValue('add-kiosk-business-type'),
    months: readNumber('add-kiosk-months'),
    paymentMethod: readValue('add-kiosk-payment-method') || 'transfer',
    kiosk: {
      facebook_name: readValue('add-kiosk-facebook-name'),
      facebook_id: optionalValue('add-kiosk-facebook-id'),
      facebook_link: optionalValue('add-kiosk-facebook-link'),
      facebook_group_link: optionalValue('add-kiosk-facebook-group-link'),
      note: optionalValue('add-kiosk-note'),
    },
  };
}

function validateKioskForm() {
  if (!readValue('add-kiosk-customer')) {
    return { valid: false, message: 'Khách hàng là bắt buộc.' };
  }

  if (!readValue('add-kiosk-facebook-name')) {
    return { valid: false, message: 'Tên Facebook là bắt buộc.' };
  }

  if (!readValue('add-kiosk-business-type')) {
    return { valid: false, message: 'Loại hình kinh doanh là bắt buộc.' };
  }

  const months = readNumber('add-kiosk-months');
  if (!Number.isInteger(months) || months < 1) {
    return { valid: false, message: 'Số tháng phải là số nguyên lớn hơn 0.' };
  }

  const facebookLink = optionalValue('add-kiosk-facebook-link');
  if (facebookLink && !isValidUrl(facebookLink)) {
    return { valid: false, message: 'Link Facebook không hợp lệ.' };
  }

  const groupLink = optionalValue('add-kiosk-facebook-group-link');
  if (groupLink && !isValidUrl(groupLink)) {
    return { valid: false, message: 'Link nhóm Facebook không hợp lệ.' };
  }

  return { valid: true };
}

function selectedCustomer() {
  const id = readValue('add-kiosk-customer');
  return customers.find((customer) => String(customer.id) === String(id));
}

function selectedBusinessType() {
  const id = readValue('add-kiosk-business-type');
  return businessTypes.find((businessType) => String(businessType.id) === String(id));
}

function fillIfEmpty(id, value) {
  const element = document.getElementById(id);
  if (element && !element.value && value) {
    element.value = value;
  }
}

function readValue(id) {
  return String(document.getElementById(id)?.value || '').trim();
}

function optionalValue(id) {
  return readValue(id) || null;
}

function readNumber(id) {
  return Number(document.getElementById(id)?.value || 0);
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function setSaving(button, saving) {
  if (!button) return;
  button.disabled = saving;
  button.textContent = saving ? 'Đang lưu...' : 'Tạo Kiosk';
}

function showFormError(message) {
  const element = document.getElementById('add-kiosk-form-error');
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
}

function clearFormError() {
  const element = document.getElementById('add-kiosk-form-error');
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
}
