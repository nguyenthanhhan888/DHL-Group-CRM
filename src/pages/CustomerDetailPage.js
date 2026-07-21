import { EmptyState } from '../components/EmptyState.js';
import { openCustomerForm } from '../components/CustomerForm.js';
import { PageHeader } from '../components/PageHeader.js';
import { FACEBOOK_GROUP_MEMBER_BASE_URL, FACEBOOK_PROFILE_BASE_URL } from '../constants/facebook.js';
import { CustomerService } from '../services/CustomerService.js';
import { KioskService } from '../services/KioskService.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { escapeHtml } from '../utils/html.js';

const RELATED_KIOSK_COLUMNS = ['Kiosk', 'Facebook ID', 'Danh mục', 'Loại hình KD', 'Ngày hết hạn', 'Tự duyệt', 'Trạng thái'];
let currentCustomer = null;

export function CustomerDetailPage() {
  return `
    ${PageHeader({
      title: 'Chi tiết khách hàng',
      description: 'Thông tin chi tiết khách hàng và các kiosk liên quan.',
      actions: '<a class="btn-secondary link-button" href="#/customers">Quay lại</a>',
    })}
    <div id="customer-detail-content">
      <section class="dash-card">
        ${EmptyState({ title: 'Đang tải khách hàng', message: 'Đang đọc dữ liệu từ Supabase.' })}
      </section>
    </div>
  `;
}

CustomerDetailPage.afterRender = async function afterRenderCustomerDetail({ params }) {
  const id = params?.get('id');
  if (!id) {
    renderCustomerDetailState('Thiếu ID khách hàng', 'Mở trang chi tiết từ danh sách khách hàng để xem dữ liệu.');
    return;
  }

  renderCustomerDetailState('Đang tải khách hàng', 'Đang đọc dữ liệu từ Supabase.');

  try {
    const [{ data: customer }, { data: kiosks }] = await Promise.all([
      CustomerService.getById(id),
      KioskService.listByCustomer(id),
    ]);

    renderCustomerDetail(customer, kiosks || []);
  } catch (error) {
    renderCustomerDetailState(
      'Không thể tải khách hàng',
      error?.message || 'Supabase trả về lỗi khi đọc thông tin khách hàng.',
    );
  }
};

function renderCustomerDetail(customer, kiosks) {
  const content = document.getElementById('customer-detail-content');
  if (!content) return;

  content.innerHTML = `
    <div class="admin-grid">
      <section class="admin-card">
        <h3>Thông tin Facebook</h3>
        <div class="settings-list">
          ${detailRow('Tên Facebook', customer.facebook_name)}
          ${detailRow('Facebook ID', customer.facebook_id)}
          ${detailRow('Link Facebook', customerFacebookLink(customer), true)}
          ${detailRow('Link nhóm Facebook', customerGroupLink(customer), true)}
          ${detailRow('Trạng thái', renderStatusBadge(customer.status), false, true)}
        </div>
      </section>
      <section class="admin-card">
        <h3>Thông tin liên hệ</h3>
        <div class="settings-list">
          ${detailRow('Số điện thoại', customer.phone)}
          ${detailRow('Địa chỉ', customer.address)}
          ${detailRow('Tổng đã thanh toán', formatCurrency(customer.total_paid || 0))}
          ${detailRow('Tổng số Kiosk', customer.total_kiosks ?? kiosks.length)}
        </div>
      </section>
    </div>

    <section class="admin-card detail-section">
      <div class="dash-card-header">
        <h3>Ghi chú</h3>
        <button class="btn-secondary" type="button" data-customer-detail-edit>Sửa</button>
      </div>
      <div class="detail-note">${escapeHtml(customer.note || '—')}</div>
    </section>

    <section class="admin-card detail-section">
      <h3>Kiosk liên quan</h3>
      ${renderRelatedKiosks(kiosks)}
    </section>
  `;

  currentCustomer = customer;
  document.querySelector('[data-customer-detail-edit]')?.addEventListener('click', () => {
    openCustomerForm({
      customer: currentCustomer,
      onSaved: () => CustomerDetailPage.afterRender({ params: new URLSearchParams({ id: customer.id }) }),
    });
  });
}

function renderRelatedKiosks(kiosks) {
  if (!kiosks.length) {
    return EmptyState({
      title: 'Chưa có kiosk liên quan',
      message: 'Khách hàng này chưa có kiosk nào trong hệ thống.',
    });
  }

  return `
    <div class="table-card">
      <table class="data-table">
        <thead>
          <tr>${RELATED_KIOSK_COLUMNS.map((column) => `<th>${column}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${kiosks.map((kiosk) => `
            <tr>
              <td class="strong-cell">${escapeHtml(kiosk.facebook_name || '—')}</td>
              <td>${escapeHtml(kiosk.facebook_id || '—')}</td>
              <td>${escapeHtml(kiosk.categories?.name || '—')}</td>
              <td>${escapeHtml(kiosk.business_types?.name || '—')}</td>
              <td>${formatDate(kiosk.end_date)}</td>
              <td>${kiosk.auto_approve ? 'Có' : 'Không'}</td>
              <td>${renderStatusBadge(kiosk.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function detailRow(label, value, isLink = false, isHtml = false) {
  const hasValue = value !== null && value !== undefined && value !== '';
  const display = hasValue ? value : '—';
  const renderedValue = isHtml
    ? display
    : isLink && hasValue
      ? `<a class="table-link" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`
      : escapeHtml(display);

  return `
    <div class="setting-item detail-row">
      <span class="setting-name">${label}</span>
      <span class="setting-value detail-value">${renderedValue}</span>
    </div>
  `;
}

function customerFacebookLink(customer) {
  if (customer.facebook_link) return customer.facebook_link;
  if (customer.facebook_url) return customer.facebook_url;
  if (customer.facebook_id) return `${FACEBOOK_PROFILE_BASE_URL}/${customer.facebook_id}`;
  return '';
}

function customerGroupLink(customer) {
  if (customer.facebook_group_link) return customer.facebook_group_link;
  if (!customer.facebook_id) return '';
  return `${FACEBOOK_GROUP_MEMBER_BASE_URL}/${customer.facebook_id}`;
}

function renderStatusBadge(status) {
  const normalized = String(status || 'inactive').toLowerCase();
  const safeClass = normalized.replace(/[^a-z0-9-]/g, '') || 'inactive';
  const labels = {
    active: 'Hoạt động',
    pending: 'Chờ duyệt',
    inactive: 'Không hoạt động',
    potential: 'Tiềm năng',
    suspended: 'Tạm ngưng',
    expired: 'Hết hạn',
  };
  return `<span class="badge badge-${safeClass}">${labels[normalized] || escapeHtml(status || 'Không rõ')}</span>`;
}

function renderCustomerDetailState(title, message) {
  const content = document.getElementById('customer-detail-content');
  if (!content) return;
  content.innerHTML = `
    <section class="dash-card">
      ${EmptyState({ title, message: escapeHtml(message) })}
    </section>
  `;
}
