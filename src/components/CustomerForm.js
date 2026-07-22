import { Modal } from './Modal.js';
import { Toast } from './Toast.js';
import { CustomerService } from '../services/CustomerService.js';
import { escapeHtml } from '../utils/html.js';

const CUSTOMER_STATUSES = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'inactive', label: 'Không hoạt động' },
];

export function openCustomerForm({ customer = null, onSaved } = {}) {
  const isEdit = Boolean(customer?.id);

  Modal.open({
    title: isEdit ? 'Cập nhật khách hàng' : 'Thêm khách hàng',
    body: renderCustomerForm(customer),
  });

  const form = document.getElementById('customer-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormError();

    const validation = validateCustomerForm();
    if (!validation.valid) {
      showFormError(validation.message);
      return;
    }

    const saveButton = document.getElementById('customer-save-button');
    setSaving(saveButton, true);

    try {
      const payload = readCustomerPayload();
      const result = isEdit
        ? await CustomerService.update(customer.id, payload)
        : await CustomerService.create(payload);

      Modal.close();
      Toast.show(isEdit ? 'Đã cập nhật khách hàng.' : 'Đã thêm khách hàng.');
      await onSaved?.(result.data);
    } catch (error) {
      showFormError(error?.message || 'Không thể lưu khách hàng vào Supabase.');
    } finally {
      setSaving(saveButton, false);
    }
  });
}

function renderCustomerForm(customer) {
  return `
    <form id="customer-form" class="modal-form" novalidate>
      <div id="customer-form-error" class="form-error hidden"></div>
      <label class="form-group">
        <span>Tên Facebook *</span>
        <input class="form-control" id="customer-facebook-name" type="text" value="${escapeHtml(customer?.facebook_name || '')}" autocomplete="off" required />
      </label>
      <label class="form-group">
        <span>Facebook ID</span>
        <input class="form-control" id="customer-facebook-id" type="text" value="${escapeHtml(customer?.facebook_id || '')}" autocomplete="off" />
      </label>
      <label class="form-group">
        <span>Link Facebook</span>
        <input class="form-control" id="customer-facebook-link" type="url" value="${escapeHtml(customerFacebookLink(customer))}" autocomplete="off" />
      </label>
      <label class="form-group">
        <span>Link nhóm Facebook</span>
        <input class="form-control" id="customer-facebook-group-link" type="url" value="${escapeHtml(customer?.facebook_group_link || '')}" autocomplete="off" />
      </label>
      <label class="form-group">
        <span>Số điện thoại *</span>
        <input class="form-control" id="customer-phone" type="tel" value="${escapeHtml(customer?.phone || '')}" autocomplete="off" required />
      </label>
      <label class="form-group">
        <span>Địa chỉ</span>
        <textarea class="form-control" id="customer-address" rows="2">${escapeHtml(customer?.address || '')}</textarea>
      </label>
      <label class="form-group">
        <span>Trạng thái</span>
        <select class="form-control" id="customer-status">
          ${CUSTOMER_STATUSES.map((status) => `
            <option value="${status.value}" ${status.value === (customer?.status || 'active') ? 'selected' : ''}>${status.label}</option>
          `).join('')}
        </select>
      </label>
      <label class="form-group">
        <span>Ghi chú</span>
        <textarea class="form-control" id="customer-note" rows="3">${escapeHtml(customer?.note || '')}</textarea>
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" type="button" data-customer-cancel>Hủy</button>
        <button class="btn-primary" id="customer-save-button" type="submit">Lưu</button>
      </div>
    </form>
  `;
}

function readCustomerPayload() {
  return {
    facebook_name: readValue('customer-facebook-name'),
    facebook_id: optionalValue('customer-facebook-id'),
    facebook_link: optionalValue('customer-facebook-link'),
    facebook_group_link: optionalValue('customer-facebook-group-link'),
    phone: readValue('customer-phone'),
    address: optionalValue('customer-address'),
    status: readValue('customer-status') || 'active',
    note: optionalValue('customer-note'),
  };
}

function validateCustomerForm() {
  if (!readValue('customer-facebook-name')) {
    return { valid: false, message: 'Tên Facebook là bắt buộc.' };
  }

  if (!readValue('customer-phone')) {
    return { valid: false, message: 'Số điện thoại là bắt buộc.' };
  }

  const facebookLink = optionalValue('customer-facebook-link');
  if (facebookLink && !isValidUrl(facebookLink)) {
    return { valid: false, message: 'Link Facebook không hợp lệ.' };
  }

  const groupLink = optionalValue('customer-facebook-group-link');
  if (groupLink && !isValidUrl(groupLink)) {
    return { valid: false, message: 'Link nhóm Facebook không hợp lệ.' };
  }

  return { valid: true };
}

function customerFacebookLink(customer) {
  return customer?.facebook_link || customer?.facebook_url || '';
}

function readValue(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function optionalValue(id) {
  return readValue(id) || null;
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function showFormError(message) {
  const element = document.getElementById('customer-form-error');
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
}

function clearFormError() {
  const element = document.getElementById('customer-form-error');
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
}

function setSaving(button, isSaving) {
  if (!button) return;
  button.disabled = isSaving;
  button.textContent = isSaving ? 'Đang lưu...' : 'Lưu';
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    if (event.target.matches('[data-customer-cancel]')) {
      Modal.close();
    }
  });
}
