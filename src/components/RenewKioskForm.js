import { Modal } from './Modal.js';
import { Toast } from './Toast.js';
import { KioskService } from '../services/KioskService.js';
import { PaymentService } from '../services/PaymentService.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { escapeHtml } from '../utils/html.js';

let currentKiosk = null;

export async function openRenewKioskForm({ kioskId, onSaved } = {}) {
  currentKiosk = null;
  Modal.open({
    title: 'Gia hạn Kiosk',
    body: renderRenewState('Đang tải Kiosk', 'Đang đọc thông tin kiosk từ Supabase.'),
  });

  try {
    const { data: kiosk } = await KioskService.getById(kioskId);
    currentKiosk = kiosk;

    Modal.open({
      title: 'Gia hạn Kiosk',
      body: renderRenewForm(kiosk),
    });
    bindRenewForm(onSaved);
    updateRenewalPreview();
  } catch (error) {
    Modal.open({
      title: 'Gia hạn Kiosk',
      body: renderRenewState(
        'Không thể tải Kiosk',
        error?.message || 'Supabase trả về lỗi khi đọc thông tin kiosk.',
      ),
    });
  }
}

function bindRenewForm(onSaved) {
  const form = document.getElementById('renew-kiosk-form');
  const monthsInput = document.getElementById('renew-months');
  const discountInput = document.getElementById('renew-discount');

  monthsInput?.addEventListener('input', updateRenewalPreview);
  discountInput?.addEventListener('input', updateRenewalPreview);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearRenewError();

    const validation = validateRenewForm();
    if (!validation.valid) {
      showRenewError(validation.message);
      return;
    }

    const saveButton = document.getElementById('renew-save-button');
    setSaving(saveButton, true);

    try {
      const payload = readRenewPayload();
      await PaymentService.renewKiosk(payload);
      Modal.close();
      Toast.show('Đã gia hạn kiosk.');
      await onSaved?.();
    } catch (error) {
      showRenewError(error?.message || 'Không thể gia hạn kiosk.');
    } finally {
      setSaving(saveButton, false);
    }
  });
}

function renderRenewForm(kiosk) {
  return `
    <form id="renew-kiosk-form" class="modal-form" novalidate>
      <div id="renew-form-error" class="form-error hidden"></div>

      <div class="renew-summary">
        <div class="setting-item">
          <span class="setting-name">Kiosk</span>
          <span class="setting-value detail-value">${escapeHtml(kiosk.facebook_name || '—')}</span>
        </div>
        <div class="setting-item">
          <span class="setting-name">Facebook ID</span>
          <span class="setting-value detail-value">${escapeHtml(kiosk.facebook_id || '—')}</span>
        </div>
        <div class="setting-item">
          <span class="setting-name">Loại hình kinh doanh</span>
          <span class="setting-value detail-value">${escapeHtml(kiosk.business_types?.name || '—')}</span>
        </div>
        <div class="setting-item">
          <span class="setting-name">Ngày hết hạn hiện tại</span>
          <span class="setting-value detail-value">${formatDate(kiosk.end_date)}</span>
        </div>
      </div>

      <div class="form-row">
        <label class="form-group">
          <span>Số tháng *</span>
          <input class="form-control" id="renew-months" type="number" min="1" step="1" value="1" required />
        </label>
        <label class="form-group">
          <span>Giảm giá</span>
          <input class="form-control" id="renew-discount" type="number" min="0" step="1000" value="0" />
        </label>
      </div>

      <label class="form-group">
        <span>Lý do giảm giá</span>
        <input class="form-control" id="renew-discount-reason" type="text" autocomplete="off" />
      </label>

      <label class="form-group">
        <span>Ghi chú</span>
        <textarea class="form-control" id="renew-note" rows="2"></textarea>
      </label>

      <div class="renew-calculation">
        ${calculationRow('Ngày bắt đầu', '<span id="renew-start-date">—</span>')}
        ${calculationRow('Ngày hết hạn', '<span id="renew-end-date">—</span>')}
        ${calculationRow('Giá/tháng', '<span id="renew-price-per-month">—</span>')}
        ${calculationRow('Tạm tính', '<span id="renew-subtotal">—</span>')}
        ${calculationRow('Tổng tiền', '<span id="renew-total-amount">—</span>', true)}
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" type="button" data-renew-cancel>Hủy</button>
        <button class="btn-primary" id="renew-save-button" type="submit">Gia hạn</button>
      </div>
    </form>
  `;
}

function renderRenewState(title, message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">∅</div>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-message">${escapeHtml(message)}</div>
    </div>
  `;
}

function calculationRow(label, value, strong = false) {
  return `
    <div class="setting-item">
      <span class="setting-name">${label}</span>
      <span class="setting-value detail-value ${strong ? 'strong-cell' : ''}">${value}</span>
    </div>
  `;
}

function updateRenewalPreview() {
  clearRenewError();

  try {
    const preview = PaymentService.calculateRenewalPreview(currentKiosk, {
      months: readNumber('renew-months'),
      discount: readNumber('renew-discount'),
    });

    setText('renew-start-date', formatDate(preview.startDate));
    setText('renew-end-date', formatDate(preview.endDate));
    setText('renew-price-per-month', formatCurrency(preview.pricePerMonth));
    setText('renew-subtotal', formatCurrency(preview.subtotal));
    setText('renew-total-amount', formatCurrency(preview.totalAmount));
  } catch (error) {
    setText('renew-start-date', '—');
    setText('renew-end-date', '—');
    setText('renew-price-per-month', '—');
    setText('renew-subtotal', '—');
    setText('renew-total-amount', '—');
    showRenewError(error?.message || 'Không thể tính gia hạn.');
  }
}

function readRenewPayload() {
  return {
    kioskId: currentKiosk?.id,
    months: readNumber('renew-months'),
    discount: readNumber('renew-discount'),
    discountReason: readValue('renew-discount-reason'),
    note: readValue('renew-note'),
  };
}

function validateRenewForm() {
  if (!currentKiosk?.id) {
    return { valid: false, message: 'Kiosk là bắt buộc.' };
  }

  const months = readNumber('renew-months');
  if (!Number.isInteger(months) || months < 1) {
    return { valid: false, message: 'Số tháng phải là số nguyên lớn hơn 0.' };
  }

  const discount = readNumber('renew-discount');
  if (!Number.isFinite(discount) || discount < 0) {
    return { valid: false, message: 'Giảm giá không hợp lệ.' };
  }

  return { valid: true };
}

function readValue(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function readNumber(id) {
  return Number(readValue(id) || 0);
}

function showRenewError(message) {
  const element = document.getElementById('renew-form-error');
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
}

function clearRenewError() {
  const element = document.getElementById('renew-form-error');
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setSaving(button, isSaving) {
  if (!button) return;
  button.disabled = isSaving;
  button.textContent = isSaving ? 'Đang gia hạn...' : 'Gia hạn';
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    if (event.target.matches('[data-renew-cancel]')) {
      Modal.close();
    }
  });
}
