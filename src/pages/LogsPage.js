import { EmptyState } from '../components/EmptyState.js';
import { Modal } from '../components/Modal.js';
import { PageHeader } from '../components/PageHeader.js';
import { Toolbar } from '../components/Toolbar.js';
import { LOG_COLUMNS } from '../constants/tables.js';
import { LogService } from '../services/LogService.js';
import { debounce } from '../utils/dom.js';
import { escapeHtml } from '../utils/html.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const ACTION_FILTERS = [
  { value: 'INSERT', label: 'Tạo mới' },
  { value: 'UPDATE', label: 'Cập nhật' },
  { value: 'DELETE', label: 'Xóa' },
  { value: 'confirm_payment', label: 'Xác nhận thanh toán' },
];
const TABLE_FILTERS = [
  { value: 'customers', label: 'Khách hàng' },
  { value: 'kiosks', label: 'Kiosk' },
  { value: 'payments', label: 'Thanh toán' },
  { value: 'categories', label: 'Danh mục' },
  { value: 'business_types', label: 'Loại hình KD' },
];
const IGNORED_DIFF_FIELDS = new Set(['updated_at']);

const state = {
  searchTerm: '',
  action: '',
  tableName: '',
  page: 1,
  pageSize: 10,
  total: 0,
  requestId: 0,
  items: [],
};

export function LogsPage() {
  return `
    ${PageHeader({
      title: 'Lịch sử thay đổi',
      description: 'Theo dõi các hành động quan trọng trong hệ thống.',
    })}
    ${Toolbar({
      children: `
        <input
          type="search"
          id="log-search"
          class="form-control"
          placeholder="Tìm theo bảng, hành động, người thay đổi, ID bản ghi"
          aria-label="Tìm lịch sử"
          autocomplete="off"
        />
        <select id="log-action-filter" class="filter-select" aria-label="Lọc hành động">
          <option value="">Tất cả hành động</option>
          ${ACTION_FILTERS.map((action) => `<option value="${action.value}">${action.label}</option>`).join('')}
        </select>
        <select id="log-table-filter" class="filter-select" aria-label="Lọc bảng">
          <option value="">Tất cả bảng</option>
          ${TABLE_FILTERS.map((table) => `<option value="${table.value}">${table.label}</option>`).join('')}
        </select>
      `,
    })}
    <div class="table-card logs-table-card">
      <table class="data-table logs-table">
        <thead>
          <tr>${LOG_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody id="logs-table-body">
          ${renderTableState('Đang tải lịch sử', 'Đang đọc dữ liệu từ Supabase.')}
        </tbody>
      </table>
    </div>
    <div class="pagination-bar">
      <div id="logs-page-summary" class="pagination-summary">—</div>
      <div class="pagination-controls">
        <select id="logs-page-size" class="filter-select compact" aria-label="Số log mỗi trang">
          ${PAGE_SIZE_OPTIONS.map((size) => `<option value="${size}" ${size === state.pageSize ? 'selected' : ''}>${size} / trang</option>`).join('')}
        </select>
        <button id="logs-prev-page" class="btn-secondary" type="button">Trước</button>
        <button id="logs-next-page" class="btn-secondary" type="button">Sau</button>
      </div>
    </div>
  `;
}

LogsPage.afterRender = function afterRenderLogs() {
  syncLogControls();
  bindLogEvents();
  loadLogs();
};

function syncLogControls() {
  const searchInput = document.getElementById('log-search');
  const actionFilter = document.getElementById('log-action-filter');
  const tableFilter = document.getElementById('log-table-filter');
  const pageSizeSelect = document.getElementById('logs-page-size');

  if (searchInput) searchInput.value = state.searchTerm;
  if (actionFilter) actionFilter.value = state.action;
  if (tableFilter) tableFilter.value = state.tableName;
  if (pageSizeSelect) pageSizeSelect.value = String(state.pageSize);
}

function bindLogEvents() {
  document.getElementById('log-search')?.addEventListener('input', debounce((event) => {
    state.searchTerm = event.target.value.trim();
    state.page = 1;
    loadLogs();
  }, 300));

  document.getElementById('log-action-filter')?.addEventListener('change', (event) => {
    state.action = event.target.value;
    state.page = 1;
    loadLogs();
  });

  document.getElementById('log-table-filter')?.addEventListener('change', (event) => {
    state.tableName = event.target.value;
    state.page = 1;
    loadLogs();
  });

  document.getElementById('logs-page-size')?.addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    loadLogs();
  });

  document.getElementById('logs-prev-page')?.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadLogs();
  });

  document.getElementById('logs-next-page')?.addEventListener('click', () => {
    if (state.page >= totalPages()) return;
    state.page += 1;
    loadLogs();
  });

  document.getElementById('logs-table-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-log-view]');
    if (!button) return;

    const log = state.items.find((item) => String(item.id) === String(button.dataset.logView));
    if (log) openLogDetail(log);
  });
}

async function loadLogs() {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  setLoadingState();

  try {
    const { data, count } = await LogService.list({
      searchTerm: state.searchTerm,
      action: state.action,
      tableName: state.tableName,
      pagination: { page: state.page, pageSize: state.pageSize },
    });

    if (requestId !== state.requestId) return;

    state.total = count || 0;
    state.items = data || [];
    renderLogs(data || []);
    renderPagination();
  } catch (error) {
    if (requestId !== state.requestId) return;
    renderError(error);
  }
}

function renderLogs(logs) {
  const body = document.getElementById('logs-table-body');
  if (!body) return;

  if (!logs.length) {
    body.innerHTML = renderTableState(
      'Chưa có lịch sử',
      'Không có bản ghi log nào khớp với bộ lọc hiện tại.',
    );
    return;
  }

  body.innerHTML = logs.map((log) => `
    <tr>
      <td>${formatDateTime(log.created_at)}</td>
      <td>${renderActionBadge(log.action)}</td>
      <td>${escapeHtml(log.table_name || '—')}</td>
      <td>${escapeHtml(log.record_id ?? '—')}</td>
      <td>${escapeHtml(log.created_by || 'Hệ thống')}</td>
      <td class="log-detail-cell">
        ${renderLogSummary(log)}
        <button class="table-action-button" type="button" data-log-view="${escapeHtml(log.id)}">Xem chi tiết</button>
      </td>
    </tr>
  `).join('');
}

function renderActionBadge(action) {
  const normalized = String(action || 'unknown').toLowerCase();
  const safeClass = normalized.replace(/[^a-z0-9-]/g, '') || 'unknown';
  const labels = {
    insert: 'Tạo mới',
    update: 'Cập nhật',
    delete: 'Xóa',
    confirm_payment: 'Xác nhận thanh toán',
  };

  return `<span class="badge badge-${safeClass}">${labels[normalized] || escapeHtml(action || 'Không rõ')}</span>`;
}

function renderLogSummary(log) {
  const oldData = getOldData(log);
  const newData = getNewData(log);
  const action = normalizeAction(log.action);

  if (action === 'confirm_payment') {
    return `
      <div class="log-detail">
        <span>Trạng thái thanh toán</span>
        <strong>${escapeHtml(oldData?.payment_status || '—')} → ${escapeHtml(newData?.payment_status || '—')}</strong>
      </div>
    `;
  }

  if (action === 'insert') {
    return `<div class="log-detail"><span>${Object.keys(newData || {}).length} trường mới</span></div>`;
  }

  if (action === 'delete') {
    return `<div class="log-detail"><span>${Object.keys(oldData || {}).length} trường đã xóa</span></div>`;
  }

  const fields = summarizeChangedFields(oldData, newData);
  if (!fields.length) return '<span class="muted-text">Không có diff</span>';

  return `
    <div class="log-detail">
      <span>${escapeHtml(fields.slice(0, 4).join(', '))}</span>
      ${fields.length > 4 ? `<strong>+${fields.length - 4}</strong>` : ''}
    </div>
  `;
}

function openLogDetail(log) {
  Modal.open({
    title: 'Chi tiết lịch sử',
    body: renderLogModal(log),
    className: 'modal-wide',
  });
}

function renderLogModal(log) {
  const oldData = getOldData(log);
  const newData = getNewData(log);
  const action = normalizeAction(log.action);

  return `
    <div class="log-meta-grid">
      ${metaRow('Thời gian', formatDateTime(log.created_at))}
      ${metaRow('Hành động', actionLabel(log.action))}
      ${metaRow('Bảng', log.table_name || '—')}
      ${metaRow('ID bản ghi', log.record_id ?? '—')}
      ${metaRow('Người thay đổi', log.created_by || 'Hệ thống')}
    </div>
    ${renderLogModalBody(action, oldData, newData)}
  `;
}

function renderLogModalBody(action, oldData, newData) {
  if (action === 'insert') {
    return renderJsonBlock('Dữ liệu mới', newData);
  }

  if (action === 'delete') {
    return renderJsonBlock('Dữ liệu đã xóa', oldData);
  }

  if (action === 'update' || action === 'confirm_payment') {
    return renderDiffTable(oldData, newData);
  }

  return `
    ${renderJsonBlock('Dữ liệu cũ', oldData)}
    ${renderJsonBlock('Dữ liệu mới', newData)}
  `;
}

function renderDiffTable(oldData, newData) {
  const fields = summarizeChangedFields(oldData, newData);
  if (!fields.length) {
    return '<div class="empty-state compact"><div class="empty-state-title">Không có diff</div></div>';
  }

  return `
    <div class="log-json-section">
      <h4>Chi tiết thay đổi</h4>
      <div class="table-card log-diff-card">
        <table class="data-table log-diff-table">
          <thead>
            <tr>
              <th>Trường</th>
              <th>Giá trị cũ</th>
              <th>Giá trị mới</th>
            </tr>
          </thead>
          <tbody>
            ${fields.map((field) => `
              <tr>
                <td class="strong-cell">${escapeHtml(field)}</td>
                <td class="old-value">${formatJsonValue(oldData?.[field])}</td>
                <td class="new-value">${formatJsonValue(newData?.[field])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderJsonBlock(title, value) {
  return `
    <div class="log-json-section">
      <h4>${escapeHtml(title)}</h4>
      <pre class="json-block">${escapeHtml(JSON.stringify(value || {}, null, 2))}</pre>
    </div>
  `;
}

function metaRow(label, value) {
  return `
    <div class="setting-item">
      <span class="setting-name">${escapeHtml(label)}</span>
      <span class="setting-value detail-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function summarizeChangedFields(oldData, newData) {
  if (!oldData && newData) return Object.keys(newData).filter((key) => !IGNORED_DIFF_FIELDS.has(key));
  if (oldData && !newData) return Object.keys(oldData).filter((key) => !IGNORED_DIFF_FIELDS.has(key));
  if (!oldData || !newData) return [];

  return [...new Set([...Object.keys(oldData), ...Object.keys(newData)])]
    .filter((key) => !IGNORED_DIFF_FIELDS.has(key))
    .filter((key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));
}

function getOldData(log) {
  return log.old_data || log.old_value || null;
}

function getNewData(log) {
  return log.new_data || log.new_value || null;
}

function normalizeAction(action) {
  return String(action || '').toLowerCase();
}

function actionLabel(action) {
  const labels = {
    insert: 'Tạo mới',
    update: 'Cập nhật',
    delete: 'Xóa',
    confirm_payment: 'Xác nhận thanh toán',
  };
  return labels[normalizeAction(action)] || action || 'Không rõ';
}

function formatJsonValue(value) {
  if (value === undefined || value === null || value === '') {
    return '<em class="muted-text">(trống)</em>';
  }

  return escapeHtml(typeof value === 'object'
    ? JSON.stringify(value)
    : String(value));
}

function setLoadingState() {
  const body = document.getElementById('logs-table-body');
  if (body) {
    body.innerHTML = renderTableState('Đang tải lịch sử', 'Đang đọc dữ liệu từ Supabase.');
  }
}

function renderError(error) {
  const body = document.getElementById('logs-table-body');
  state.total = 0;
  state.items = [];

  if (body) {
    body.innerHTML = renderTableState(
      'Không thể tải lịch sử',
      error?.message || 'Supabase trả về lỗi khi đọc bảng logs.',
    );
  }

  renderPagination();
}

function renderTableState(title, message) {
  return `
    <tr>
      <td colspan="${LOG_COLUMNS.length}">
        ${EmptyState({ title, message: escapeHtml(message) })}
      </td>
    </tr>
  `;
}

function renderPagination() {
  const summary = document.getElementById('logs-page-summary');
  const prev = document.getElementById('logs-prev-page');
  const next = document.getElementById('logs-next-page');
  const pages = totalPages();

  if (summary) {
    summary.textContent = state.total
      ? `Trang ${state.page} / ${pages} · ${state.total} log`
      : '0 log';
  }

  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = state.page >= pages;
}

function totalPages() {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
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
