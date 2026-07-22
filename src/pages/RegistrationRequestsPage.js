import { EmptyState } from '../components/EmptyState.js';
import { PageHeader } from '../components/PageHeader.js';
import { RegistrationRequestService } from '../services/RegistrationRequestService.js';
import { formatCurrency } from '../utils/currency.js';
import { escapeHtml } from '../utils/html.js';

const state = { status: 'pending', busyId: null };

export function RegistrationRequestsPage() {
  return `
    ${PageHeader({
      title: 'Duyệt đơn đăng ký',
      description: 'Kiểm tra đăng ký và xác nhận thanh toán trước khi kích hoạt kiosk.',
    })}
    <div class="toolbar">
      <select id="request-status-filter" class="filter-select" aria-label="Lọc trạng thái đơn">
        <option value="pending">Chờ duyệt</option>
        <option value="approved">Đã duyệt</option>
        <option value="rejected">Đã từ chối</option>
        <option value="">Tất cả</option>
      </select>
      <button id="request-reload" class="btn-secondary" type="button">Tải lại</button>
    </div>
    <div class="table-card">
      <table class="data-table request-table">
        <thead><tr>
          <th>#</th><th>Khách/Kiosk</th><th>Liên hệ</th><th>Dịch vụ</th>
          <th>Thời hạn</th><th>Số tiền</th><th>Ngày gửi</th><th>Trạng thái</th><th>Thao tác</th>
        </tr></thead>
        <tbody id="request-table-body">
          ${loadingRow()}
        </tbody>
      </table>
    </div>
  `;
}

RegistrationRequestsPage.afterRender = function afterRenderRequests() {
  const filter = document.getElementById('request-status-filter');
  if (filter) filter.value = state.status;
  filter?.addEventListener('change', (event) => {
    state.status = event.target.value;
    loadRequests();
  });
  document.getElementById('request-reload')?.addEventListener('click', loadRequests);
  document.getElementById('request-table-body')?.addEventListener('click', handleAction);
  loadRequests();
};

async function loadRequests() {
  const body = document.getElementById('request-table-body');
  if (!body) return;
  body.innerHTML = loadingRow();
  try {
    const { data } = await RegistrationRequestService.list(state.status);
    renderRows(data || []);
  } catch (error) {
    body.innerHTML = stateRow('Không tải được đơn đăng ký', error?.message || 'Supabase trả về lỗi.');
  }
}

function renderRows(rows) {
  const body = document.getElementById('request-table-body');
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = stateRow('Không có đơn đăng ký', 'Không có đơn nào ở trạng thái đã chọn.');
    return;
  }

  body.innerHTML = rows.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td><strong>${escapeHtml(item.facebook_name || '—')}</strong><br><span class="muted-text">FB ID: ${escapeHtml(item.facebook_id || '—')}</span></td>
      <td>${escapeHtml(item.phone || '—')}<br>${safeHref(item.facebook_link) ? `<a class="table-link" href="${escapeHtml(safeHref(item.facebook_link))}" target="_blank" rel="noreferrer">Mở Facebook</a>` : ''}</td>
      <td>${escapeHtml(item.business_types?.name || item.service_name || '—')}<br><span class="muted-text">${escapeHtml(item.categories?.name || '')}</span></td>
      <td>${Number(item.months || 0)} tháng</td>
      <td class="strong-cell">${formatCurrency(item.total_amount || 0)}</td>
      <td>${formatDateTime(item.submitted_at)}</td>
      <td>${statusBadge(item.status, item.rejection_reason)}</td>
      <td>${actionButtons(item)}</td>
    </tr>
  `).join('');
}

async function handleAction(event) {
  const button = event.target.closest('[data-request-action]');
  if (!button || state.busyId) return;
  const id = Number(button.dataset.requestId);
  const action = button.dataset.requestAction;
  if (!id) return;

  let reason = '';
  if (action === 'reject') {
    reason = window.prompt('Nhập lý do từ chối đơn:')?.trim() || '';
    if (!reason) return;
  } else if (!window.confirm('Xác nhận đã nhận thanh toán và kích hoạt kiosk này?')) {
    return;
  }

  state.busyId = id;
  setRowButtonsDisabled(id, true);
  try {
    if (action === 'approve') await RegistrationRequestService.approve(id);
    if (action === 'reject') await RegistrationRequestService.reject(id, reason);
    await loadRequests();
  } catch (error) {
    window.alert(error?.message || 'Không thể xử lý đơn đăng ký.');
  } finally {
    state.busyId = null;
    setRowButtonsDisabled(id, false);
  }
}

function actionButtons(item) {
  if (item.status !== 'pending') return '—';
  return `<div class="request-actions">
    <button class="table-approve-button" type="button" data-request-action="approve" data-request-id="${item.id}">Duyệt</button>
    <button class="table-cancel-button" type="button" data-request-action="reject" data-request-id="${item.id}">Từ chối</button>
  </div>`;
}

function statusBadge(status, reason) {
  const labels = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
  const badge = `<span class="badge badge-${escapeHtml(status || 'pending')}">${labels[status] || 'Không rõ'}</span>`;
  return reason ? `${badge}<br><span class="muted-text">${escapeHtml(reason)}</span>` : badge;
}

function setRowButtonsDisabled(id, disabled) {
  document.querySelectorAll(`[data-request-id="${id}"]`).forEach((button) => {
    button.disabled = disabled;
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function safeHref(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function loadingRow() {
  return stateRow('Đang tải đơn đăng ký', 'Đang đọc dữ liệu từ Supabase.');
}

function stateRow(title, message) {
  return `<tr><td colspan="9">${EmptyState({ title, message: escapeHtml(message) })}</td></tr>`;
}
