import { EmptyState } from '../components/EmptyState.js';
import { PageHeader } from '../components/PageHeader.js';
import { StatCard } from '../components/StatCard.js';
import { DisabledButton, Toolbar } from '../components/Toolbar.js';
import { BusinessTypeService } from '../services/BusinessTypeService.js';
import { PaymentService } from '../services/PaymentService.js';
import { formatCurrency } from '../utils/currency.js';
import { debounce } from '../utils/dom.js';
import { escapeHtml } from '../utils/html.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const PAYMENT_COLUMNS = [
  { label: '#', key: null },
  { label: 'Khách hàng', key: null },
  { label: 'Kiosk', key: null },
  { label: 'Loại hình KD', key: null },
  { label: 'Số tháng', key: 'months' },
  { label: 'Giảm giá', key: 'discount' },
  { label: 'Giá/tháng', key: 'price_per_month' },
  { label: 'Tổng tiền', key: 'total_amount' },
  { label: 'Trạng thái thanh toán', key: 'payment_status' },
  { label: 'Người xác nhận', key: null },
  { label: 'Ngày tạo', key: 'created_at' },
];

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'rejected', label: 'Bị từ chối' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'bank_transfer', label: 'Chuyển khoản NH' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'momo', label: 'Momo' },
];

const state = {
  searchTerm: '',
  status: '',
  paymentMethod: '',
  businessTypeId: '',
  page: 1,
  pageSize: 10,
  sort: { column: 'created_at', ascending: false },
  total: 0,
  requestId: 0,
  businessTypes: [],
};

export function PaymentsPage() {
  return `
    ${PageHeader({
      title: 'Thanh toán',
      description: 'Lịch sử thanh toán bất biến, xác nhận qua Supabase RPC.',
      actions: DisabledButton({ label: '+ Tạo thanh toán' }),
    })}
    ${Toolbar({
      children: `
        <input
          type="search"
          id="payment-search"
          class="form-control"
          placeholder="Tìm theo khách hàng, kiosk, loại hình KD, trạng thái"
          aria-label="Tìm thanh toán"
          autocomplete="off"
        />
        <select id="payment-status-filter" class="filter-select" aria-label="Lọc trạng thái thanh toán">
          <option value="">Tất cả trạng thái</option>
          ${PAYMENT_STATUSES.map((status) => `<option value="${status.value}">${status.label}</option>`).join('')}
        </select>
        <select id="payment-business-type-filter" class="filter-select" aria-label="Lọc loại hình kinh doanh">
          <option value="">Tất cả loại hình KD</option>
        </select>
        <select id="payment-method-filter" class="filter-select" aria-label="Lọc phương thức thanh toán">
          <option value="">Tất cả phương thức</option>
          ${PAYMENT_METHODS.map((method) => `<option value="${method.value}">${method.label}</option>`).join('')}
        </select>
      `,
    })}
    <div class="payments-summary">
      ${StatCard({ tone: 'green', icon: '💰', value: '<span id="payments-total-revenue">—</span>', label: 'Tổng thu' })}
      ${StatCard({ tone: 'blue', icon: '📅', value: '<span id="payments-month-revenue">—</span>', label: 'Tháng này' })}
      ${StatCard({ tone: 'teal', icon: '🏦', value: '<span id="payments-transfer-revenue">—</span>', label: 'Chuyển khoản' })}
      ${StatCard({ tone: 'purple', icon: '⏳', value: '<span id="payments-pending-count">—</span>', label: 'Chờ xác nhận' })}
    </div>
    <div class="table-card payments-table-card">
      <table class="data-table payments-table">
        <thead>
          <tr>${PAYMENT_COLUMNS.map(renderHeaderCell).join('')}</tr>
        </thead>
        <tbody id="payments-table-body">
          ${renderTableState('Đang tải thanh toán', 'Đang đọc dữ liệu từ Supabase.')}
        </tbody>
      </table>
    </div>
    <div class="pagination-bar">
      <div id="payments-page-summary" class="pagination-summary">—</div>
      <div class="pagination-controls">
        <select id="payments-page-size" class="filter-select compact" aria-label="Số dòng mỗi trang">
          ${PAGE_SIZE_OPTIONS.map((size) => `<option value="${size}" ${size === state.pageSize ? 'selected' : ''}>${size} / trang</option>`).join('')}
        </select>
        <button id="payments-prev-page" class="btn-secondary" type="button">Trước</button>
        <button id="payments-next-page" class="btn-secondary" type="button">Sau</button>
      </div>
    </div>
  `;
}

PaymentsPage.afterRender = function afterRenderPayments() {
  syncPaymentControls();
  bindPaymentEvents();
  loadBusinessTypeOptions();
  loadPayments();
};

function syncPaymentControls() {
  const searchInput = document.getElementById('payment-search');
  const statusFilter = document.getElementById('payment-status-filter');
  const businessTypeFilter = document.getElementById('payment-business-type-filter');
  const methodFilter = document.getElementById('payment-method-filter');
  const pageSizeSelect = document.getElementById('payments-page-size');

  if (searchInput) searchInput.value = state.searchTerm;
  if (statusFilter) statusFilter.value = state.status;
  if (businessTypeFilter) businessTypeFilter.value = state.businessTypeId;
  if (methodFilter) methodFilter.value = state.paymentMethod;
  if (pageSizeSelect) pageSizeSelect.value = String(state.pageSize);
}

function bindPaymentEvents() {
  const searchInput = document.getElementById('payment-search');
  const statusFilter = document.getElementById('payment-status-filter');
  const businessTypeFilter = document.getElementById('payment-business-type-filter');
  const methodFilter = document.getElementById('payment-method-filter');
  const pageSizeSelect = document.getElementById('payments-page-size');

  searchInput?.addEventListener('input', debounce((event) => {
    state.searchTerm = event.target.value.trim();
    state.page = 1;
    loadPayments();
  }, 300));

  statusFilter?.addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    loadPayments();
  });

  businessTypeFilter?.addEventListener('change', (event) => {
    state.businessTypeId = event.target.value;
    state.page = 1;
    loadPayments();
  });

  methodFilter?.addEventListener('change', (event) => {
    state.paymentMethod = event.target.value;
    state.page = 1;
    loadPayments();
  });

  pageSizeSelect?.addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    loadPayments();
  });

  document.getElementById('payments-prev-page')?.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadPayments();
  });

  document.getElementById('payments-next-page')?.addEventListener('click', () => {
    if (state.page >= totalPages()) return;
    state.page += 1;
    loadPayments();
  });

  document.querySelectorAll('[data-payment-sort-column]').forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.paymentSortColumn;
      if (state.sort.column === column) {
        state.sort.ascending = !state.sort.ascending;
      } else {
        state.sort = { column, ascending: true };
      }
      state.page = 1;
      loadPayments();
    });
  });
}

async function loadBusinessTypeOptions() {
  const select = document.getElementById('payment-business-type-filter');
  if (!select) return;

  select.disabled = true;

  try {
    const { data } = await BusinessTypeService.listActive();
    state.businessTypes = data || [];
    renderBusinessTypeOptions();
  } catch (error) {
    state.businessTypes = [];
    select.innerHTML = '<option value="">Không tải được loại hình KD</option>';
  } finally {
    select.disabled = false;
  }
}

async function loadPayments() {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  setLoadingState();

  try {
    const filters = {
      searchTerm: state.searchTerm,
      status: state.status,
      paymentMethod: state.paymentMethod,
      businessTypeId: state.businessTypeId,
    };
    const { data, count, summary } = await PaymentService.listWithSummary({
      ...filters,
      sort: state.sort,
      pagination: { page: state.page, pageSize: state.pageSize },
    });

    if (requestId !== state.requestId) return;

    state.total = count || 0;
    renderSummary(summary);
    renderPayments(data || []);
    renderPagination();
    renderSortState();
  } catch (error) {
    if (requestId !== state.requestId) return;
    renderError(error);
  }
}

function renderBusinessTypeOptions() {
  const select = document.getElementById('payment-business-type-filter');
  if (!select) return;

  select.innerHTML = `
    <option value="">Tất cả loại hình KD</option>
    ${state.businessTypes.map((item) => `
      <option value="${escapeHtml(item.id)}">${escapeHtml(item.name || 'Không tên')}</option>
    `).join('')}
  `;
  select.value = state.businessTypeId;
}

function renderPayments(payments) {
  const body = document.getElementById('payments-table-body');
  if (!body) return;

  if (!payments.length) {
    body.innerHTML = renderTableState(
      'Không tìm thấy thanh toán',
      'Không có bản ghi nào khớp với bộ lọc hiện tại.',
    );
    return;
  }

  const startIndex = (state.page - 1) * state.pageSize;
  body.innerHTML = payments.map((payment, index) => `
    <tr>
      <td>${startIndex + index + 1}</td>
      <td>${renderCustomer(payment)}</td>
      <td>${renderKiosk(payment)}</td>
      <td>${escapeHtml(payment.kiosks?.business_types?.name || '—')}</td>
      <td>${Number(payment.months || 0)}</td>
      <td>${formatCurrency(payment.discount || 0)}</td>
      <td>${formatCurrency(payment.price_per_month || 0)}</td>
      <td class="strong-cell">${formatCurrency(payment.total_amount || 0)}</td>
      <td>${renderPaymentStatusBadge(payment.payment_status)}</td>
      <td>${escapeHtml(confirmedBy(payment))}</td>
      <td>${formatDateTime(payment.created_at)}</td>
    </tr>
  `).join('');
}

function renderSummary(summary = {}) {
  setText('payments-total-revenue', formatCurrency(summary.totalRevenue || 0));
  setText('payments-month-revenue', formatCurrency(summary.monthRevenue || 0));
  setText('payments-transfer-revenue', formatCurrency(summary.transferRevenue || 0));
  setText('payments-pending-count', String(summary.pendingCount || 0));
}

function renderCustomer(payment) {
  const name = payment.customers?.facebook_name || '—';
  if (!payment.customer_id) return escapeHtml(name);
  return `<a class="table-link" href="#/customer-detail?id=${encodeURIComponent(payment.customer_id)}">${escapeHtml(name)}</a>`;
}

function renderKiosk(payment) {
  const name = payment.kiosks?.facebook_name || '—';
  if (!payment.kiosk_id) return escapeHtml(name);
  return `<a class="table-link" href="#/kiosk-detail?id=${encodeURIComponent(payment.kiosk_id)}">${escapeHtml(name)}</a>`;
}

function confirmedBy(payment) {
  return payment.confirmed_by_name
    || payment.confirmed_by_email
    || payment.confirmed_by_user
    || payment.confirmed_by
    || '—';
}

function renderHeaderCell(column) {
  if (!column.key) return `<th>${column.label}</th>`;
  return `
    <th>
      <button class="sort-button" type="button" data-payment-sort-column="${column.key}">
        ${column.label}<span class="sort-icon"></span>
      </button>
    </th>
  `;
}

function setLoadingState() {
  const body = document.getElementById('payments-table-body');
  if (body) {
    body.innerHTML = renderTableState('Đang tải thanh toán', 'Đang đọc dữ liệu từ Supabase.');
  }
}

function renderError(error) {
  const body = document.getElementById('payments-table-body');
  state.total = 0;
  renderSummary();

  if (body) {
    body.innerHTML = renderTableState(
      'Không thể tải thanh toán',
      error?.message || 'Supabase trả về lỗi khi đọc bảng payments.',
    );
  }

  renderPagination();
}

function renderTableState(title, message) {
  return `
    <tr>
      <td colspan="${PAYMENT_COLUMNS.length}">
        ${EmptyState({ title, message: escapeHtml(message) })}
      </td>
    </tr>
  `;
}

function renderPagination() {
  const summary = document.getElementById('payments-page-summary');
  const prev = document.getElementById('payments-prev-page');
  const next = document.getElementById('payments-next-page');
  const pages = totalPages();

  if (summary) {
    summary.textContent = state.total
      ? `Trang ${state.page} / ${pages} · ${state.total} thanh toán`
      : '0 thanh toán';
  }

  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = state.page >= pages;
}

function renderSortState() {
  document.querySelectorAll('[data-payment-sort-column]').forEach((button) => {
    const active = button.dataset.paymentSortColumn === state.sort.column;
    button.classList.toggle('active', active);
    button.dataset.direction = active ? (state.sort.ascending ? 'asc' : 'desc') : '';
  });
}

function renderPaymentStatusBadge(status) {
  const normalized = String(status || 'pending').toLowerCase();
  const safeClass = normalized.replace(/[^a-z0-9-]/g, '') || 'pending';
  const labels = {
    pending: 'Chờ xác nhận',
    completed: 'Hoàn thành',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
  };

  return `<span class="badge badge-${safeClass}">${labels[normalized] || escapeHtml(status || 'Không rõ')}</span>`;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function totalPages() {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}
