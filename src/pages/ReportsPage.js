import { EmptyState } from '../components/EmptyState.js';
import { PageHeader } from '../components/PageHeader.js';
import { StatCard } from '../components/StatCard.js';
import { Toast } from '../components/Toast.js';
import { Toolbar } from '../components/Toolbar.js';
import { BusinessTypeService } from '../services/BusinessTypeService.js';
import { CategoryService } from '../services/CategoryService.js';
import { ReportService } from '../services/ReportService.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate, startOfToday, toDateOnly } from '../utils/date.js';
import { escapeHtml } from '../utils/html.js';

const REPORT_TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'revenue', label: 'Doanh thu' },
  { id: 'kiosks', label: 'Kiosk' },
  { id: 'reconciliation', label: 'Đối soát' },
];

const state = {
  activeTab: 'overview',
  filters: defaultFilters(),
  categories: [],
  businessTypes: [],
  report: null,
  requestId: 0,
};

export function ReportsPage() {
  return `
    ${PageHeader({
      title: 'Báo cáo',
      description: 'Báo cáo vận hành từ dữ liệu Supabase.',
      actions: '<button class="btn-secondary" id="report-export-button" type="button">Xuất CSV</button>',
    })}
    ${Toolbar({
      children: `
        <input id="report-start-date" class="form-control compact-date" type="date" aria-label="Ngày bắt đầu" />
        <input id="report-end-date" class="form-control compact-date" type="date" aria-label="Ngày kết thúc" />
        <select id="report-category-filter" class="filter-select" aria-label="Lọc danh mục">
          <option value="">Tất cả danh mục</option>
        </select>
        <select id="report-business-type-filter" class="filter-select" aria-label="Lọc loại hình kinh doanh">
          <option value="">Tất cả loại hình KD</option>
        </select>
        <button class="btn-secondary" id="report-refresh-button" type="button">Làm mới</button>
      `,
    })}
    <div class="report-tabs" role="tablist" aria-label="Báo cáo">
      ${REPORT_TABS.map((tab) => `
        <button class="report-tab ${tab.id === state.activeTab ? 'active' : ''}" type="button" role="tab" data-report-tab="${tab.id}" aria-selected="${tab.id === state.activeTab}">
          ${tab.label}
        </button>
      `).join('')}
    </div>
    <div id="reports-content">
      ${renderLoadingState()}
    </div>
  `;
}

ReportsPage.afterRender = function afterRenderReports() {
  syncReportControls();
  bindReportEvents();
  loadFilterOptions();
  loadReportData();
};

function bindReportEvents() {
  document.getElementById('report-start-date')?.addEventListener('change', (event) => {
    state.filters.startDate = event.target.value;
    loadReportData();
  });

  document.getElementById('report-end-date')?.addEventListener('change', (event) => {
    state.filters.endDate = event.target.value;
    loadReportData();
  });

  document.getElementById('report-category-filter')?.addEventListener('change', (event) => {
    state.filters.categoryId = event.target.value;
    clearBusinessTypeIfOutsideCategory();
    renderBusinessTypeOptions();
    loadReportData();
  });

  document.getElementById('report-business-type-filter')?.addEventListener('change', (event) => {
    state.filters.businessTypeId = event.target.value;
    loadReportData();
  });

  document.getElementById('report-refresh-button')?.addEventListener('click', loadReportData);
  document.getElementById('report-export-button')?.addEventListener('click', exportCurrentReport);

  document.querySelectorAll('[data-report-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.reportTab;
      renderTabs();
      renderReportContent();
    });
  });
}

function syncReportControls() {
  const startDate = document.getElementById('report-start-date');
  const endDate = document.getElementById('report-end-date');
  const category = document.getElementById('report-category-filter');
  const businessType = document.getElementById('report-business-type-filter');

  if (startDate) startDate.value = state.filters.startDate;
  if (endDate) endDate.value = state.filters.endDate;
  if (category) category.value = state.filters.categoryId;
  if (businessType) businessType.value = state.filters.businessTypeId;
}

async function loadFilterOptions() {
  try {
    const [categories, businessTypes] = await Promise.all([
      CategoryService.listActive(),
      BusinessTypeService.listActive(),
    ]);

    state.categories = categories.data || [];
    state.businessTypes = businessTypes.data || [];
    renderCategoryOptions();
    renderBusinessTypeOptions();
  } catch (error) {
    state.categories = [];
    state.businessTypes = [];
    renderCategoryOptions('Không tải được danh mục');
    renderBusinessTypeOptions('Không tải được loại hình KD');
  }
}

async function loadReportData() {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  state.report = null;
  setReportLoading();

  try {
    const { data } = await ReportService.getReportData(state.filters);
    if (requestId !== state.requestId) return;
    state.report = data;
    renderReportContent();
  } catch (error) {
    if (requestId !== state.requestId) return;
    renderReportError(error);
  }
}

function renderCategoryOptions(errorText = '') {
  const select = document.getElementById('report-category-filter');
  if (!select) return;

  select.innerHTML = errorText
    ? `<option value="">${escapeHtml(errorText)}</option>`
    : `
      <option value="">Tất cả danh mục</option>
      ${state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || 'Không tên')}</option>`).join('')}
    `;
  select.value = state.filters.categoryId;
}

function renderBusinessTypeOptions(errorText = '') {
  const select = document.getElementById('report-business-type-filter');
  if (!select) return;

  const businessTypes = filteredBusinessTypes();
  select.innerHTML = errorText
    ? `<option value="">${escapeHtml(errorText)}</option>`
    : `
      <option value="">Tất cả loại hình KD</option>
      ${businessTypes.map((businessType) => `<option value="${escapeHtml(businessType.id)}">${escapeHtml(businessType.name || 'Không tên')}</option>`).join('')}
    `;
  select.value = state.filters.businessTypeId;
}

function filteredBusinessTypes() {
  if (!state.filters.categoryId) return state.businessTypes;
  return state.businessTypes.filter((businessType) => String(businessType.category_id) === String(state.filters.categoryId));
}

function clearBusinessTypeIfOutsideCategory() {
  if (!state.filters.businessTypeId || !state.filters.categoryId) return;

  const businessType = state.businessTypes.find((item) => String(item.id) === String(state.filters.businessTypeId));
  if (businessType && String(businessType.category_id) !== String(state.filters.categoryId)) {
    state.filters.businessTypeId = '';
  }
}

function renderTabs() {
  document.querySelectorAll('[data-report-tab]').forEach((button) => {
    const active = button.dataset.reportTab === state.activeTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function renderReportContent() {
  const content = document.getElementById('reports-content');
  if (!content) return;

  if (!state.report) {
    content.innerHTML = renderLoadingState();
    return;
  }

  const renderers = {
    overview: renderOverviewReport,
    revenue: renderRevenueReport,
    kiosks: renderKioskReport,
    reconciliation: renderReconciliationReport,
  };

  content.innerHTML = (renderers[state.activeTab] || renderOverviewReport)(state.report);
}

function renderOverviewReport(report) {
  return `
    ${renderSummaryCards([
      StatCard({ tone: 'blue', icon: '✅', value: report.summary.completedCount, label: 'Thanh toán hoàn thành' }),
      StatCard({ tone: 'purple', icon: '⏳', value: report.summary.pendingCount, label: 'Thanh toán chờ duyệt' }),
      StatCard({ tone: 'orange', icon: '🏪', value: report.summary.warningKiosks, label: 'Kiosk sắp hết hạn' }),
      StatCard({ tone: 'red', icon: '❌', value: report.summary.expiredKiosks, label: 'Kiosk hết hạn' }),
    ])}
    <div class="report-grid">
      ${renderReportCard('Khách hàng doanh thu cao', renderTable(topCustomerColumns(), report.topCustomers, 'Không có khách hàng phát sinh doanh thu trong kỳ.'))}
      ${renderReportCard('Trạng thái thanh toán', renderTable(paymentStatusColumns(), report.paymentStatusRows, 'Không có thanh toán trong kỳ.'))}
    </div>
    <div class="stats-grid report-stats report-total-block">
      ${StatCard({ tone: 'green', icon: '💰', value: formatCurrency(report.summary.totalRevenue), label: 'Doanh thu trong kỳ', className: 'stat-card-fluid' })}
    </div>
  `;
}

function renderRevenueReport(report) {
  return `
    ${renderSummaryCards([
      StatCard({ tone: 'green', icon: '💰', value: formatCurrency(report.summary.totalRevenue), label: 'Tổng doanh thu', className: 'stat-card-fluid' }),
      StatCard({ tone: 'blue', icon: '🧾', value: report.summary.completedCount, label: 'Thanh toán hoàn thành' }),
      StatCard({ tone: 'teal', icon: '🏦', value: formatCurrency(report.summary.pendingAmount), label: 'Đang chờ thu', className: 'stat-card-fluid' }),
      StatCard({ tone: 'purple', icon: '📊', value: averagePayment(report), label: 'Trung bình/thanh toán' }),
    ])}
    <div class="report-grid">
      ${renderReportCard('Doanh thu theo tháng', renderTable(monthRevenueColumns(), report.revenueByMonth, 'Không có doanh thu theo tháng.'))}
      ${renderReportCard('Doanh thu theo loại hình kinh doanh', renderTable(businessTypeRevenueColumns(), report.revenueByBusinessType, 'Không có doanh thu theo loại hình kinh doanh.'))}
      ${renderReportCard('Doanh thu theo phương thức', renderTable(paymentMethodColumns(), report.revenueByPaymentMethod, 'Không có dữ liệu phương thức thanh toán.'))}
    </div>
  `;
}

function renderKioskReport(report) {
  const followUpRows = report.kioskRows
    .filter((kiosk) => ['warning', 'expired', 'pending'].includes(kiosk.derivedStatus))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  return `
    ${renderSummaryCards([
      StatCard({ tone: 'blue', icon: '🏪', value: report.summary.totalKiosks, label: 'Tổng Kiosk' }),
      StatCard({ tone: 'green', icon: '✅', value: report.summary.activeKiosks, label: 'Đang hoạt động' }),
      StatCard({ tone: 'orange', icon: '⏰', value: report.summary.warningKiosks, label: 'Sắp hết hạn' }),
      StatCard({ tone: 'red', icon: '❌', value: report.summary.expiredKiosks, label: 'Hết hạn' }),
      StatCard({ tone: 'purple', icon: '⏳', value: report.summary.pendingKiosks, label: 'Chờ duyệt' }),
    ])}
    <div class="report-grid">
      ${renderReportCard('Trạng thái Kiosk', renderTable(kioskStatusColumns(), report.kioskStatusRows, 'Không có kiosk.'))}
      ${renderReportCard('Kiosk cần theo dõi', renderTable(kioskFollowUpColumns(), followUpRows, 'Không có kiosk cần theo dõi.'))}
    </div>
  `;
}

function renderReconciliationReport(report) {
  return `
    ${renderSummaryCards([
      StatCard({ tone: 'purple', icon: '⏳', value: report.summary.pendingCount, label: 'Thanh toán chờ xác nhận' }),
      StatCard({ tone: 'teal', icon: '💳', value: formatCurrency(report.summary.pendingAmount), label: 'Tổng tiền chờ xác nhận', className: 'stat-card-fluid' }),
      StatCard({ tone: 'orange', icon: '⚠️', value: report.summary.issueCount, label: 'Cảnh báo dữ liệu' }),
      StatCard({ tone: 'red', icon: '↩️', value: report.summary.rejectedCount, label: 'Thanh toán bị từ chối' }),
    ])}
    <div class="report-grid single">
      ${renderReportCard('Đối soát thanh toán', renderTable(reconciliationColumns(), report.reconciliationRows, 'Không có thanh toán cần đối soát.'))}
    </div>
  `;
}

function renderSummaryCards(cards) {
  return `<div class="stats-grid report-stats">${cards.join('')}</div>`;
}

function renderReportCard(title, content) {
  return `
    <section class="report-card">
      <div class="dash-card-header"><h3>${escapeHtml(title)}</h3></div>
      ${content}
    </section>
  `;
}

function renderTable(columns, rows, emptyMessage) {
  return `
    <div class="report-table-wrap">
      <table class="data-table report-table">
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map((row) => `
              <tr>
                ${columns.map((column) => `<td>${column.render(row)}</td>`).join('')}
              </tr>
            `).join('')
            : `<tr><td colspan="${columns.length}">${EmptyState({ title: 'Không có dữ liệu', message: emptyMessage })}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function topCustomerColumns() {
  return [
    { label: 'Khách hàng', render: (row) => renderCustomerLink(row.customerId, row.customerName) },
    { label: 'SĐT', render: (row) => escapeHtml(row.phone || '—') },
    { label: 'Kiosk', render: (row) => Number(row.kioskCount || 0) },
    { label: 'Thanh toán', render: (row) => Number(row.paymentCount || 0) },
    { label: 'Tổng tiền', render: (row) => `<strong>${formatCurrency(row.totalAmount)}</strong>` },
  ];
}

function paymentStatusColumns() {
  return [
    { label: 'Trạng thái', render: (row) => renderStatusBadge(row.status, row.label) },
    { label: 'Số payment', render: (row) => Number(row.paymentCount || 0) },
    { label: 'Tổng tiền', render: (row) => formatCurrency(row.totalAmount) },
  ];
}

function monthRevenueColumns() {
  return [
    { label: 'Tháng', render: (row) => escapeHtml(row.label) },
    { label: 'Thanh toán', render: (row) => Number(row.paymentCount || 0) },
    { label: 'Doanh thu', render: (row) => `<strong>${formatCurrency(row.totalAmount)}</strong>` },
  ];
}

function businessTypeRevenueColumns() {
  return [
    { label: 'Loại hình KD', render: (row) => escapeHtml(row.businessTypeName || '—') },
    { label: 'Danh mục', render: (row) => escapeHtml(row.categoryName || '—') },
    { label: 'Thanh toán', render: (row) => Number(row.paymentCount || 0) },
    { label: 'Doanh thu', render: (row) => `<strong>${formatCurrency(row.totalAmount)}</strong>` },
  ];
}

function paymentMethodColumns() {
  return [
    { label: 'Phương thức', render: (row) => escapeHtml(row.paymentMethod || '—') },
    { label: 'Thanh toán', render: (row) => Number(row.paymentCount || 0) },
    { label: 'Doanh thu', render: (row) => formatCurrency(row.totalAmount) },
  ];
}

function kioskStatusColumns() {
  return [
    { label: 'Trạng thái', render: (row) => renderStatusBadge(row.status, row.label) },
    { label: 'Số kiosk', render: (row) => Number(row.kioskCount || 0) },
    { label: 'Đã thu', render: (row) => formatCurrency(row.totalPaid) },
  ];
}

function kioskFollowUpColumns() {
  return [
    { label: 'Kiosk', render: (row) => renderKioskLink(row.id, row.facebookName) },
    { label: 'Khách hàng', render: (row) => escapeHtml(row.customerName || '—') },
    { label: 'Loại hình KD', render: (row) => escapeHtml(row.businessTypeName || '—') },
    { label: 'Trạng thái', render: (row) => renderStatusBadge(row.derivedStatus) },
    { label: 'Ngày hết hạn', render: (row) => formatDate(row.endDate) },
    { label: 'Còn lại', render: (row) => formatDaysLeft(row.daysLeft) },
  ];
}

function reconciliationColumns() {
  return [
    { label: 'Vấn đề', render: (row) => `<span class="${row.issueLevel === 'warning' ? 'old-value' : 'muted-text'}">${escapeHtml(row.issue || '—')}</span>` },
    { label: 'Thanh toán', render: (row) => escapeHtml(row.paymentId || '—') },
    { label: 'Khách hàng', render: (row) => renderCustomerLink(row.customerId, row.customerName) },
    { label: 'Kiosk', render: (row) => renderKioskLink(row.kioskId, row.kioskName) },
    { label: 'Trạng thái', render: (row) => renderStatusBadge(row.paymentStatus) },
    { label: 'Tổng tiền', render: (row) => formatCurrency(row.totalAmount) },
    { label: 'Ngày tạo', render: (row) => formatDateTime(row.createdAt) },
  ];
}

function renderCustomerLink(id, name) {
  const safeName = escapeHtml(name || 'Không tên');
  if (!id) return safeName;
  return `<a class="table-link" href="#/customer-detail?id=${encodeURIComponent(id)}">${safeName}</a>`;
}

function renderKioskLink(id, name) {
  const safeName = escapeHtml(name || 'Không tên');
  if (!id) return safeName;
  return `<a class="table-link" href="#/kiosk-detail?id=${encodeURIComponent(id)}">${safeName}</a>`;
}

function renderStatusBadge(status, label = '') {
  const normalized = String(status || 'unknown').toLowerCase();
  const safeClass = normalized.replace(/[^a-z0-9-]/g, '') || 'unknown';
  const labels = {
    active: 'Hoạt động',
    warning: 'Sắp hết hạn',
    expired: 'Hết hạn',
    pending: 'Chờ xác nhận',
    completed: 'Hoàn thành',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
    inactive: 'Không hoạt động',
    suspended: 'Tạm ngưng',
  };

  return `<span class="badge badge-${safeClass}">${escapeHtml(label || labels[normalized] || status || 'Không rõ')}</span>`;
}

function averagePayment(report) {
  if (!report.summary.completedCount) return formatCurrency(0);
  return formatCurrency(report.summary.totalRevenue / report.summary.completedCount);
}

function formatDaysLeft(value) {
  if (value === null || value === undefined) return '—';
  if (value < 0) return `Quá hạn ${Math.abs(value)} ngày`;
  if (value === 0) return 'Hết hạn hôm nay';
  return `${value} ngày`;
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

function setReportLoading() {
  const content = document.getElementById('reports-content');
  if (content) content.innerHTML = renderLoadingState();
}

function renderLoadingState() {
  return `
    <section class="report-card">
      ${EmptyState({ title: 'Đang tải báo cáo', message: 'Đang đọc dữ liệu từ Supabase.' })}
    </section>
  `;
}

function renderReportError(error) {
  const content = document.getElementById('reports-content');
  if (!content) return;

  content.innerHTML = `
    <section class="report-card">
      ${EmptyState({
        title: 'Không thể tải báo cáo',
        message: escapeHtml(error?.message || 'Supabase trả về lỗi khi đọc dữ liệu báo cáo.'),
      })}
    </section>
  `;
}

function exportCurrentReport() {
  if (!state.report) {
    Toast.show('Chưa có dữ liệu báo cáo để xuất.');
    return;
  }

  const rows = getExportRows();
  if (!rows.length) {
    Toast.show('Tab hiện tại không có dữ liệu để xuất.');
    return;
  }

  downloadCsv(rows, `bao-cao-${state.activeTab}-${state.filters.startDate}-${state.filters.endDate}.csv`);
}

function getExportRows() {
  const report = state.report;
  if (state.activeTab === 'overview') {
    return [
      ...report.topCustomers.map((row) => ({
        'Nhóm': 'Khách hàng doanh thu cao',
        'Khách hàng': row.customerName,
        'SĐT': row.phone,
        'Số Kiosk': row.kioskCount,
        'Số thanh toán': row.paymentCount,
        'Tổng tiền': row.totalAmount,
      })),
      ...report.paymentStatusRows.map((row) => ({
        'Nhóm': 'Trạng thái thanh toán',
        'Trạng thái': row.label,
        'Số thanh toán': row.paymentCount,
        'Tổng tiền': row.totalAmount,
      })),
    ];
  }

  if (state.activeTab === 'revenue') {
    return [
      ...report.revenueByMonth.map((row) => ({
        'Nhóm': 'Doanh thu theo tháng',
        'Tháng': row.label,
        'Số thanh toán': row.paymentCount,
        'Tổng tiền': row.totalAmount,
      })),
      ...report.revenueByBusinessType.map((row) => ({
        'Nhóm': 'Doanh thu theo loại hình kinh doanh',
        'Loại hình KD': row.businessTypeName,
        'Danh mục': row.categoryName,
        'Số thanh toán': row.paymentCount,
        'Tổng tiền': row.totalAmount,
      })),
      ...report.revenueByPaymentMethod.map((row) => ({
        'Nhóm': 'Doanh thu theo phương thức',
        'Phương thức': row.paymentMethod,
        'Số thanh toán': row.paymentCount,
        'Tổng tiền': row.totalAmount,
      })),
    ];
  }

  if (state.activeTab === 'kiosks') {
    return report.kioskRows.map((row) => ({
      'ID Kiosk': row.id,
      'Kiosk': row.facebookName,
      'Khách hàng': row.customerName,
      'Loại hình KD': row.businessTypeName,
      'Danh mục': row.categoryName,
      'Trạng thái': row.derivedStatus,
      'Ngày bắt đầu': row.startDate,
      'Ngày hết hạn': row.endDate,
      'Số ngày còn lại': row.daysLeft,
      'Đã thu': row.totalPaid,
    }));
  }

  return report.reconciliationRows.map((row) => ({
    'Vấn đề': row.issue,
    'ID thanh toán': row.paymentId,
    'Khách hàng': row.customerName,
    'Kiosk': row.kioskName,
    'Loại hình KD': row.businessTypeName,
    'Trạng thái': row.paymentStatus,
    'Phương thức': row.paymentMethod,
    'Tổng tiền': row.totalAmount,
    'Ngày tạo': row.createdAt,
    'Người xác nhận': row.confirmedBy,
  }));
}

function downloadCsv(rows, filename) {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function rowsToCsv(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];

  return lines.join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function defaultFilters() {
  const today = startOfToday();
  return {
    startDate: toDateOnly(new Date(today.getFullYear(), 0, 1)),
    endDate: toDateOnly(today),
    categoryId: '',
    businessTypeId: '',
  };
}
