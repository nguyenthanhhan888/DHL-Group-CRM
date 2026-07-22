import { PageHeader } from '../components/PageHeader.js';
import { BusinessTypeService } from '../services/BusinessTypeService.js';
import { CategoryService } from '../services/CategoryService.js';
import { RegistrationService } from '../services/RegistrationService.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { escapeHtml } from '../utils/html.js';

const STEPS = [
  'Thông tin khách hàng',
  'Loại hình và thời hạn',
  'Thanh toán',
];

const VIETQR_CONFIG = {
  bankId: 'MB',
  bankName: 'MB Bank',
  accountNo: '088812102004',
  accountName: 'NGUYEN THANH HAN',
  accountNameDisplay: 'Nguyễn Thanh Hân',
  template: 'compact2',
};

const state = {
  currentStep: 0,
  categories: [],
  businessTypes: [],
  selectedBusinessType: null,
  preview: null,
};

export function RegisterPage() {
  resetState();

  return `
    ${PageHeader({
      title: 'Đăng ký trực tuyến',
      description: 'Đăng ký Kiosk và thanh toán bằng chuyển khoản VietQR.',
    })}
    <section class="form-card registration-card">
      <form id="public-registration-form" novalidate>
        <div class="registration-stepper">
          ${STEPS.map((step, index) => `
            <div class="registration-step" data-registration-step="${index}">
              <span>${index + 1}</span>
              <strong>${step}</strong>
            </div>
          `).join('')}
        </div>

        <div id="registration-form-error" class="form-error hidden"></div>

        <div class="registration-panel" data-registration-panel="0">
          <div class="form-row">
            <label class="form-group">
              <span>Tên Facebook *</span>
              <input class="form-control" id="register-facebook-name" type="text" autocomplete="name" required />
            </label>
            <label class="form-group">
              <span>Số điện thoại *</span>
              <input class="form-control" id="register-phone" type="tel" inputmode="tel" autocomplete="tel" required />
            </label>
          </div>
          <div class="form-row">
            <label class="form-group">
              <span>Facebook ID <small class="field-optional">Không bắt buộc</small></span>
              <input class="form-control" id="register-facebook-id" type="text" inputmode="numeric" autocomplete="off" />
            </label>
            <label class="form-group">
              <span>Link Facebook</span>
              <input class="form-control" id="register-facebook-link" type="url" inputmode="url" autocomplete="url" />
            </label>
          </div>
          <label class="form-group">
            <span>Địa chỉ</span>
            <textarea class="form-control" id="register-address" rows="2" autocomplete="street-address"></textarea>
          </label>
          <label class="form-group">
            <span>Ghi chú</span>
            <textarea class="form-control" id="register-note" rows="3"></textarea>
          </label>
        </div>

        <div class="registration-panel hidden" data-registration-panel="1">
          <div class="form-row">
            <label class="form-group">
              <span>Danh mục *</span>
              <select class="form-control" id="register-category" required>
                <option value="">Đang tải danh mục</option>
              </select>
            </label>
            <label class="form-group">
              <span>Loại hình kinh doanh *</span>
              <select class="form-control" id="register-business-type" required disabled>
                <option value="">Chọn danh mục trước</option>
              </select>
            </label>
          </div>
          <div class="form-row">
            <label class="form-group">
              <span>Số tháng *</span>
              <input class="form-control" id="register-months" type="number" min="1" step="1" value="1" required />
            </label>
            <label class="form-group">
              <span>Giảm giá (VNĐ)</span>
              <input class="form-control" id="register-discount" type="number" min="0" step="1000" value="0" />
            </label>
          </div>
          <label class="form-group">
            <span>Lý do giảm giá <small class="field-optional">Bắt buộc khi có giảm giá</small></span>
            <input class="form-control" id="register-discount-reason" type="text" autocomplete="off" />
          </label>
          <div class="registration-summary">
            ${summaryRow('Giá theo tháng', '<span id="register-selected-price">—</span>', true)}
            ${summaryRow('Tạm tính', '<span id="register-step-subtotal">—</span>', true)}
            ${summaryRow('Giảm giá', '<span id="register-step-discount">0 đ</span>', true)}
            ${summaryRow('Thành tiền', '<span id="register-step-total">—</span>', true)}
          </div>
        </div>

        <div class="registration-panel hidden" data-registration-panel="2">
          <div class="registration-summary">
            ${summaryRow('Ngày bắt đầu', '<span id="register-start-date">—</span>', true)}
            ${summaryRow('Ngày hết hạn', '<span id="register-end-date">—</span>', true)}
            ${summaryRow('Giá/tháng', '<span id="register-price-per-month">—</span>', true)}
            ${summaryRow('Số tháng', '<span id="register-preview-months">—</span>', true)}
            ${summaryRow('Tạm tính', '<span id="register-subtotal">—</span>', true)}
            ${summaryRow('Giảm giá', '<span id="register-discount-amount">0 đ</span>', true)}
            ${summaryRow('Tổng tiền', '<span id="register-total-amount">—</span>', true)}
          </div>
          ${renderVietQrPaymentCard()}
        </div>

        <div class="registration-actions">
          <button class="btn-secondary hidden" id="register-prev-button" type="button">Quay lại</button>
          <button class="btn-primary" id="register-next-button" type="button">Tiếp tục</button>
          <button class="btn-secondary hidden" id="register-cancel-button" type="button">Hủy</button>
          <button class="btn-primary hidden" id="register-submit-button" type="submit">Tôi đã thanh toán</button>
        </div>
      </form>
      <div id="registration-success" class="registration-success hidden"></div>
    </section>
  `;
}

RegisterPage.afterRender = function afterRenderRegister() {
  bindRegistrationEvents();
  loadCategories();
  renderStep();
};

function bindRegistrationEvents() {
  document.getElementById('register-prev-button')?.addEventListener('click', () => {
    if (state.currentStep <= 0) return;
    state.currentStep -= 1;
    clearFormError();
    renderStep();
  });

  document.getElementById('register-next-button')?.addEventListener('click', () => {
    if (!validateStep(state.currentStep)) return;
    state.currentStep = Math.min(state.currentStep + 1, STEPS.length - 1);
    clearFormError();
    renderStep();
  });

  document.getElementById('register-cancel-button')?.addEventListener('click', cancelRegistration);

  document.getElementById('register-category')?.addEventListener('change', async (event) => {
    state.selectedBusinessType = null;
    state.preview = null;
    await loadBusinessTypes(event.target.value);
    updateSelectedBusinessType();
    updatePreview();
  });

  document.getElementById('register-business-type')?.addEventListener('change', () => {
    updateSelectedBusinessType();
    updatePreview();
  });

  document.getElementById('register-months')?.addEventListener('input', updatePreview);
  document.getElementById('register-discount')?.addEventListener('input', updatePreview);
  document.getElementById('register-facebook-name')?.addEventListener('input', updateVietQrPayment);

  document.getElementById('public-registration-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep(state.currentStep)) return;
    await submitRegistration();
  });
}

async function loadCategories() {
  const select = document.getElementById('register-category');
  if (!select) return;

  select.disabled = true;
  select.innerHTML = '<option value="">Đang tải danh mục</option>';

  try {
    const { data } = await CategoryService.listActive();
    state.categories = data || [];
    select.innerHTML = `
      <option value="">Chọn danh mục</option>
      ${state.categories.map((category) => `
        <option value="${escapeHtml(category.id)}">${escapeHtml(category.name || 'Không tên')}</option>
      `).join('')}
    `;
  } catch (error) {
    showFormError(error?.message || 'Không thể tải danh mục từ Supabase.');
    select.innerHTML = '<option value="">Không tải được danh mục</option>';
  } finally {
    select.disabled = false;
  }
}

async function loadBusinessTypes(categoryId) {
  const select = document.getElementById('register-business-type');
  if (!select) return;

  state.businessTypes = [];
  select.disabled = true;
  select.innerHTML = '<option value="">Đang tải loại hình</option>';

  if (!categoryId) {
    select.innerHTML = '<option value="">Chọn danh mục trước</option>';
    setText('register-selected-price', '—');
    setText('register-step-subtotal', '—');
    return;
  }

  try {
    const { data } = await BusinessTypeService.listByCategory(categoryId);
    state.businessTypes = data || [];
    select.innerHTML = `
      <option value="">Chọn loại hình kinh doanh</option>
      ${state.businessTypes.map((businessType) => `
        <option value="${escapeHtml(businessType.id)}">${escapeHtml(businessType.name || 'Không tên')}</option>
      `).join('')}
    `;
    select.disabled = false;
  } catch (error) {
    showFormError(error?.message || 'Không thể tải loại hình kinh doanh từ Supabase.');
    select.innerHTML = '<option value="">Không tải được loại hình</option>';
  }
}

async function submitRegistration() {
  const submitButton = document.getElementById('register-submit-button');
  clearFormError();
  setSubmitting(submitButton, true);

  try {
    const { data } = await RegistrationService.submit({
      customer: readCustomerPayload(),
      businessTypeId: readValue('register-business-type'),
      months: readNumber('register-months'),
      discount: readNumber('register-discount'),
      discountReason: readValue('register-discount-reason'),
    });
    renderSuccess(data);
  } catch (error) {
    showFormError(error?.message || 'Không thể gửi đăng ký vào Supabase.');
  } finally {
    setSubmitting(submitButton, false);
  }
}

function updateSelectedBusinessType() {
  const selectedId = readValue('register-business-type');
  state.selectedBusinessType = state.businessTypes.find((item) => String(item.id) === selectedId) || null;
  setText(
    'register-selected-price',
    state.selectedBusinessType ? formatCurrency(state.selectedBusinessType.price_per_month || 0) : '—',
  );
}

function updatePreview() {
  try {
    updateSelectedBusinessType();
    state.preview = RegistrationService.calculatePreview(state.selectedBusinessType, {
      months: readNumber('register-months'),
      discount: readNumber('register-discount'),
    });

    setText('register-step-subtotal', formatCurrency(state.preview.subtotal));
    setText('register-step-discount', formatCurrency(state.preview.discount));
    setText('register-step-total', formatCurrency(state.preview.totalAmount));
    setText('register-start-date', formatDate(state.preview.startDate));
    setText('register-end-date', formatDate(state.preview.endDate));
    setText('register-price-per-month', formatCurrency(state.preview.pricePerMonth));
    setText('register-preview-months', String(state.preview.months));
    setText('register-subtotal', formatCurrency(state.preview.subtotal));
    setText('register-discount-amount', formatCurrency(state.preview.discount));
    setText('register-total-amount', formatCurrency(state.preview.totalAmount));
    updateVietQrPayment();
  } catch {
    state.preview = null;
    setText('register-step-subtotal', '—');
    setText('register-step-discount', '—');
    setText('register-step-total', '—');
    setText('register-start-date', '—');
    setText('register-end-date', '—');
    setText('register-price-per-month', '—');
    setText('register-preview-months', '—');
    setText('register-subtotal', '—');
    setText('register-discount-amount', '—');
    setText('register-total-amount', '—');
    clearVietQrPayment();
  }
}

function validateStep(step) {
  clearFormError();

  if (step === 0) {
    if (!readValue('register-facebook-name')) {
      showFormError('Tên Facebook là bắt buộc.');
      return false;
    }

    if (!readValue('register-phone')) {
      showFormError('Số điện thoại là bắt buộc.');
      return false;
    }

    if (!validateOptionalUrl('register-facebook-link', 'Link Facebook')) return false;
  }

  if (step === 1) {
    if (!readValue('register-category')) {
      showFormError('Danh mục là bắt buộc.');
      return false;
    }

    if (!readValue('register-business-type')) {
      showFormError('Loại hình kinh doanh là bắt buộc.');
      return false;
    }

    const months = readNumber('register-months');
    if (!Number.isInteger(months) || months < 1) {
      showFormError('Số tháng phải là số nguyên lớn hơn 0.');
      return false;
    }

    const discount = readNumber('register-discount');
    if (!Number.isFinite(discount) || discount < 0) {
      showFormError('Giảm giá phải là số lớn hơn hoặc bằng 0.');
      return false;
    }

    if (discount > 0 && !readValue('register-discount-reason')) {
      showFormError('Cần nhập lý do khi áp dụng giảm giá.');
      return false;
    }
  }

  if (step >= 1) {
    updatePreview();
    if (!state.preview) {
      showFormError('Không thể tính giá từ loại hình kinh doanh và số tháng hiện tại.');
      return false;
    }
  }

  return true;
}

function validateOptionalUrl(id, label) {
  const value = readValue(id);
  if (!value) return true;

  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return true;
  } catch {
    // Use the shared validation message below.
  }

  showFormError(`${label} không hợp lệ.`);
  return false;
}

function renderStep() {
  document.querySelectorAll('[data-registration-step]').forEach((element) => {
    const step = Number(element.dataset.registrationStep);
    element.classList.toggle('active', step === state.currentStep);
    element.classList.toggle('completed', step < state.currentStep);
  });

  document.querySelectorAll('[data-registration-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', Number(panel.dataset.registrationPanel) !== state.currentStep);
  });

  const isPaymentStep = state.currentStep === STEPS.length - 1;
  document.getElementById('register-prev-button')?.classList.toggle(
    'hidden',
    state.currentStep === 0 || isPaymentStep,
  );
  document.getElementById('register-next-button')?.classList.toggle('hidden', isPaymentStep);
  document.getElementById('register-cancel-button')?.classList.toggle('hidden', !isPaymentStep);
  document.getElementById('register-submit-button')?.classList.toggle('hidden', !isPaymentStep);

  if (state.currentStep >= 1) updatePreview();
}

function cancelRegistration() {
  const form = document.getElementById('public-registration-form');
  form?.reset();
  resetState();
  clearFormError();
  clearVietQrPayment();

  const businessTypeSelect = document.getElementById('register-business-type');
  if (businessTypeSelect) {
    businessTypeSelect.disabled = true;
    businessTypeSelect.innerHTML = '<option value="">Chọn danh mục trước</option>';
  }

  renderStep();
  loadCategories();
  document.querySelector('.registration-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSuccess(data) {
  document.getElementById('public-registration-form')?.classList.add('hidden');

  const success = document.getElementById('registration-success');
  if (!success) return;

  success.classList.remove('hidden');
  success.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">✓</div>
      <div class="empty-state-title">Đã ghi nhận thanh toán</div>
      <div class="empty-state-message">Đăng ký đã được gửi và đang chờ Admin xác nhận thanh toán.</div>
    </div>
    <div class="registration-summary">
      ${summaryRow('Khách hàng', escapeHtml(data.customer?.facebook_name || '—'), true)}
      ${summaryRow('Kiosk', escapeHtml(data.kiosk?.facebook_name || '—'), true)}
      ${summaryRow('Trạng thái', '<span class="badge badge-pending">Chờ Admin xác nhận</span>', true)}
      ${summaryRow('Tổng tiền', formatCurrency(data.preview?.totalAmount || 0), true)}
    </div>
  `;
}

function renderVietQrPaymentCard() {
  return `
    <section class="vietqr-payment-card hidden" id="register-vietqr-card">
      <div class="vietqr-payment-header">
        <h3>Chuyển khoản VietQR</h3>
        <span class="badge badge-active">${escapeHtml(VIETQR_CONFIG.bankName)}</span>
      </div>
      <div class="vietqr-payment-grid">
        <div class="vietqr-image-frame">
          <img id="register-vietqr-image" alt="Mã QR chuyển khoản đăng ký kiosk" loading="eager" />
        </div>
        <div class="settings-list">
          ${summaryRow('Ngân hàng', VIETQR_CONFIG.bankName)}
          ${summaryRow('Số tài khoản', VIETQR_CONFIG.accountNo)}
          ${summaryRow('Người thụ hưởng', VIETQR_CONFIG.accountNameDisplay)}
          ${summaryRow('Số tiền', '<span id="register-vietqr-amount">—</span>', true)}
          ${summaryRow('Nội dung CK', '<span id="register-vietqr-content">—</span>', true)}
          <a id="register-vietqr-link" class="btn-secondary link-button" href="#" target="_blank" rel="noreferrer">Mở mã QR</a>
        </div>
      </div>
    </section>
  `;
}

function updateVietQrPayment() {
  const card = document.getElementById('register-vietqr-card');
  const image = document.getElementById('register-vietqr-image');
  const link = document.getElementById('register-vietqr-link');
  const amount = document.getElementById('register-vietqr-amount');
  const content = document.getElementById('register-vietqr-content');
  const payment = buildVietQrPayment(state.preview, readValue('register-facebook-name'));

  if (!card || !image || !link || !amount || !content) return;

  if (!payment) {
    clearVietQrPayment();
    return;
  }

  image.src = payment.qrUrl;
  link.href = payment.qrUrl;
  amount.textContent = formatCurrency(payment.amount);
  content.textContent = payment.transferContent;
  card.classList.remove('hidden');
}

function clearVietQrPayment() {
  const card = document.getElementById('register-vietqr-card');
  const image = document.getElementById('register-vietqr-image');
  const link = document.getElementById('register-vietqr-link');

  card?.classList.add('hidden');
  if (image) image.removeAttribute('src');
  if (link) link.href = '#';
  setText('register-vietqr-amount', '—');
  setText('register-vietqr-content', '—');
}

function buildVietQrPayment(preview, kioskName) {
  const amount = Math.round(Number(preview?.totalAmount || 0));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const transferContent = buildTransferContent(kioskName);
  return {
    amount,
    transferContent,
    qrUrl: buildVietQrUrl(amount, transferContent),
  };
}

function buildVietQrUrl(amount, transferContent) {
  const params = [
    `amount=${encodeURIComponent(String(amount))}`,
    `addInfo=${encodeURIComponent(transferContent)}`,
    `accountName=${encodeURIComponent(VIETQR_CONFIG.accountName)}`,
  ].join('&');

  return `https://img.vietqr.io/image/${VIETQR_CONFIG.bankId}-${VIETQR_CONFIG.accountNo}-${VIETQR_CONFIG.template}.png?${params}`;
}

function buildTransferContent(kioskName) {
  const name = String(kioskName || 'Khách hàng').replace(/\s+/g, ' ').trim();
  return `${name} chuyển tiền đăng ký kiosk`;
}

function summaryRow(label, value, isHtml = false) {
  return `
    <div class="setting-item">
      <span class="setting-name">${label}</span>
      <span class="setting-value detail-value">${isHtml ? value : escapeHtml(value)}</span>
    </div>
  `;
}

function readCustomerPayload() {
  return {
    facebook_name: readValue('register-facebook-name'),
    facebook_id: readValue('register-facebook-id'),
    facebook_link: readValue('register-facebook-link'),
    phone: readValue('register-phone'),
    address: readValue('register-address'),
    note: readValue('register-note'),
  };
}

function readValue(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function readNumber(id) {
  return Number(readValue(id) || 0);
}

function showFormError(message) {
  const element = document.getElementById('registration-form-error');
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
}

function clearFormError() {
  const element = document.getElementById('registration-form-error');
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setSubmitting(button, isSubmitting) {
  if (!button) return;
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? 'Đang gửi...' : 'Tôi đã thanh toán';
}

function resetState() {
  state.currentStep = 0;
  state.categories = [];
  state.businessTypes = [];
  state.selectedBusinessType = null;
  state.preview = null;
}
