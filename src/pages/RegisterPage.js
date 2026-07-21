import { PageHeader } from '../components/PageHeader.js';
import { BusinessTypeService } from '../services/BusinessTypeService.js';
import { CategoryService } from '../services/CategoryService.js';
import { RegistrationService } from '../services/RegistrationService.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { escapeHtml } from '../utils/html.js';

const STEPS = [
  'Thông tin khách hàng',
  'Loại hình kinh doanh',
  'Số tháng',
  'Tính giá',
  'Xác nhận',
];

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'momo', label: 'Momo' },
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
  submitted: null,
};

export function RegisterPage() {
  resetState();

  return `
    ${PageHeader({
      title: 'Đăng ký trực tuyến',
      description: 'Tạo hồ sơ đăng ký mới với trạng thái chờ xác nhận.',
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
              <input class="form-control" id="register-facebook-name" type="text" autocomplete="off" required />
            </label>
            <label class="form-group">
              <span>Số điện thoại *</span>
              <input class="form-control" id="register-phone" type="tel" autocomplete="off" required />
            </label>
          </div>
          <div class="form-row">
            <label class="form-group">
              <span>Facebook ID</span>
              <input class="form-control" id="register-facebook-id" type="text" autocomplete="off" />
            </label>
            <label class="form-group">
              <span>Link Facebook</span>
              <input class="form-control" id="register-facebook-link" type="url" autocomplete="off" />
            </label>
          </div>
          <label class="form-group">
            <span>Link nhóm Facebook</span>
            <input class="form-control" id="register-facebook-group-link" type="url" autocomplete="off" />
          </label>
          <label class="form-group">
            <span>Địa chỉ</span>
            <textarea class="form-control" id="register-address" rows="2"></textarea>
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
          <div class="registration-summary">
            ${summaryRow('Giá theo tháng', '<span id="register-selected-price">—</span>', true)}
            ${summaryRow('Trạng thái', '<span class="badge badge-pending">Chờ xác nhận</span>', true)}
          </div>
        </div>

        <div class="registration-panel hidden" data-registration-panel="2">
          <div class="form-row">
            <label class="form-group">
              <span>Số tháng *</span>
              <input class="form-control" id="register-months" type="number" min="1" step="1" value="1" required />
            </label>
            <label class="form-group">
              <span>Phương thức thanh toán</span>
              <select class="form-control" id="register-payment-method">
                ${PAYMENT_METHODS.map((method) => `<option value="${method.value}">${method.label}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        <div class="registration-panel hidden" data-registration-panel="3">
          <div class="registration-summary">
            ${summaryRow('Ngày bắt đầu', '<span id="register-start-date">—</span>', true)}
            ${summaryRow('Ngày hết hạn', '<span id="register-end-date">—</span>', true)}
            ${summaryRow('Giá/tháng', '<span id="register-price-per-month">—</span>', true)}
            ${summaryRow('Số tháng', '<span id="register-preview-months">—</span>', true)}
            ${summaryRow('Tạm tính', '<span id="register-subtotal">—</span>', true)}
            ${summaryRow('Tổng tiền', '<span id="register-total-amount">—</span>', true)}
          </div>
          ${renderVietQrPaymentCard()}
        </div>

        <div class="registration-panel hidden" data-registration-panel="4">
          <div class="registration-review-grid">
            <div class="settings-list">
              ${summaryRow('Khách hàng', '<span id="review-customer-name">—</span>', true)}
              ${summaryRow('Số điện thoại', '<span id="review-phone">—</span>', true)}
              ${summaryRow('Facebook ID', '<span id="review-facebook-id">—</span>', true)}
              ${summaryRow('Trạng thái khách hàng', '<span class="badge badge-pending">Chờ xác nhận</span>', true)}
            </div>
            <div class="settings-list">
              ${summaryRow('Loại hình kinh doanh', '<span id="review-business-type">—</span>', true)}
              ${summaryRow('Số tháng', '<span id="review-months">—</span>', true)}
              ${summaryRow('Ngày hết hạn', '<span id="review-end-date">—</span>', true)}
              ${summaryRow('Tổng tiền', '<span id="review-total-amount">—</span>', true)}
            </div>
          </div>
          <div class="registration-summary">
            ${summaryRow('Trạng thái Kiosk', '<span class="badge badge-pending">Chờ xác nhận</span>', true)}
            ${summaryRow('Trạng thái thanh toán', '<span class="badge badge-pending">Chờ xác nhận</span>', true)}
          </div>
        </div>

        <div class="registration-actions">
          <button class="btn-secondary" id="register-prev-button" type="button">Trước</button>
          <button class="btn-primary" id="register-next-button" type="button">Tiếp tục</button>
          <button class="btn-primary hidden" id="register-submit-button" type="submit">Gửi đăng ký</button>
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

    if (state.currentStep === 2 || state.currentStep === 3) {
      updatePreview();
    }

    if (state.currentStep === 3) {
      updateReview();
    }

    state.currentStep = Math.min(state.currentStep + 1, STEPS.length - 1);
    clearFormError();
    renderStep();
  });

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
  document.getElementById('register-payment-method')?.addEventListener('change', updateVietQrPayment);

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

function submitRegistration() {
  const submitButton = document.getElementById('register-submit-button');
  clearFormError();
  setSubmitting(submitButton, true);

  return RegistrationService.submit({
    customer: readCustomerPayload(),
    businessTypeId: readValue('register-business-type'),
    months: readNumber('register-months'),
    paymentMethod: readValue('register-payment-method') || 'transfer',
  }).then(({ data }) => {
    state.submitted = data;
    renderSuccess(data);
  }).catch((error) => {
    showFormError(error?.message || 'Không thể gửi đăng ký vào Supabase.');
  }).finally(() => {
    setSubmitting(submitButton, false);
  });
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
    });

    setText('register-start-date', formatDate(state.preview.startDate));
    setText('register-end-date', formatDate(state.preview.endDate));
    setText('register-price-per-month', formatCurrency(state.preview.pricePerMonth));
    setText('register-preview-months', String(state.preview.months));
    setText('register-subtotal', formatCurrency(state.preview.subtotal));
    setText('register-total-amount', formatCurrency(state.preview.totalAmount));
    updateVietQrPayment();
  } catch {
    state.preview = null;
    setText('register-start-date', '—');
    setText('register-end-date', '—');
    setText('register-price-per-month', '—');
    setText('register-preview-months', '—');
    setText('register-subtotal', '—');
    setText('register-total-amount', '—');
    clearVietQrPayment();
  }
}

function updateReview() {
  if (!state.preview) updatePreview();

  setText('review-customer-name', readValue('register-facebook-name') || '—');
  setText('review-phone', readValue('register-phone') || '—');
  setText('review-facebook-id', readValue('register-facebook-id') || '—');
  setText('review-business-type', state.selectedBusinessType?.name || '—');
  setText('review-months', state.preview ? String(state.preview.months) : '—');
  setText('review-end-date', state.preview ? formatDate(state.preview.endDate) : '—');
  setText('review-total-amount', state.preview ? formatCurrency(state.preview.totalAmount) : '—');
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
    if (!validateOptionalUrl('register-facebook-group-link', 'Link nhóm Facebook')) return false;
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
  }

  if (step === 2) {
    const months = readNumber('register-months');
    if (!Number.isInteger(months) || months < 1) {
      showFormError('Số tháng phải là số nguyên lớn hơn 0.');
      return false;
    }
  }

  if (step === 3 || step === 4) {
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
    // Fall through to shared message.
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

  const prev = document.getElementById('register-prev-button');
  const next = document.getElementById('register-next-button');
  const submit = document.getElementById('register-submit-button');

  if (prev) prev.disabled = state.currentStep === 0;
  next?.classList.toggle('hidden', state.currentStep === STEPS.length - 1);
  submit?.classList.toggle('hidden', state.currentStep !== STEPS.length - 1);

  if (state.currentStep === 3) updatePreview();
  if (state.currentStep === 4) updateReview();
}

function renderSuccess(data) {
  document.getElementById('public-registration-form')?.classList.add('hidden');

  const success = document.getElementById('registration-success');
  if (!success) return;

  success.classList.remove('hidden');
  success.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">✓</div>
      <div class="empty-state-title">Đã gửi đăng ký</div>
      <div class="empty-state-message">Thanh toán đang ở trạng thái chờ xác nhận để admin duyệt.</div>
    </div>
    <div class="registration-summary">
      ${summaryRow('Khách hàng', escapeHtml(data.customer?.facebook_name || '—'), true)}
      ${summaryRow('Kiosk', escapeHtml(data.kiosk?.facebook_name || '—'), true)}
      ${summaryRow('Trạng thái thanh toán', '<span class="badge badge-pending">Chờ xác nhận</span>', true)}
      ${summaryRow('Tổng tiền', formatCurrency(data.preview?.totalAmount || 0), true)}
    </div>
    ${renderStaticVietQrPayment(data.preview, data.kiosk?.facebook_name || data.customer?.facebook_name, data.payment?.payment_method)}
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
          <img id="register-vietqr-image" alt="Mã QR chuyển khoản đăng ký kiosk" loading="lazy" />
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

function renderStaticVietQrPayment(preview, kioskName, paymentMethod = 'transfer') {
  const payment = buildVietQrPayment(preview, kioskName, paymentMethod);
  if (!payment) return '';

  return `
    <section class="vietqr-payment-card">
      <div class="vietqr-payment-header">
        <h3>Chuyển khoản VietQR</h3>
        <span class="badge badge-active">${escapeHtml(VIETQR_CONFIG.bankName)}</span>
      </div>
      <div class="vietqr-payment-grid">
        <div class="vietqr-image-frame">
          <img src="${escapeHtml(payment.qrUrl)}" alt="Mã QR chuyển khoản đăng ký kiosk" loading="lazy" />
        </div>
        <div class="settings-list">
          ${summaryRow('Ngân hàng', VIETQR_CONFIG.bankName)}
          ${summaryRow('Số tài khoản', VIETQR_CONFIG.accountNo)}
          ${summaryRow('Người thụ hưởng', VIETQR_CONFIG.accountNameDisplay)}
          ${summaryRow('Số tiền', formatCurrency(payment.amount))}
          ${summaryRow('Nội dung CK', payment.transferContent)}
          <a class="btn-secondary link-button" href="${escapeHtml(payment.qrUrl)}" target="_blank" rel="noreferrer">Mở mã QR</a>
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
  const payment = buildVietQrPayment(
    state.preview,
    readValue('register-facebook-name'),
    readValue('register-payment-method') || 'transfer',
  );

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

function buildVietQrPayment(preview, kioskName, paymentMethod = 'transfer') {
  if (paymentMethod !== 'transfer') return null;

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
    facebook_group_link: readValue('register-facebook-group-link'),
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
  button.textContent = isSubmitting ? 'Đang gửi...' : 'Gửi đăng ký';
}

function resetState() {
  state.currentStep = 0;
  state.categories = [];
  state.businessTypes = [];
  state.selectedBusinessType = null;
  state.preview = null;
  state.submitted = null;
}
