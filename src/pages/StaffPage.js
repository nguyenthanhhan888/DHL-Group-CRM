import { EmptyState } from '../components/EmptyState.js';
import { Modal } from '../components/Modal.js';
import { PageHeader } from '../components/PageHeader.js';
import { Toast } from '../components/Toast.js';
import { StaffService } from '../services/StaffService.js';
import { escapeHtml } from '../utils/html.js';

const state = { staff: [], busy: false };

export function StaffPage() {
  return `
    ${PageHeader({
      title: 'Quản lý nhân viên',
      description: 'Admin tạo tài khoản và đặt lại mật khẩu cho nhân viên kiểm duyệt.',
      actions: '<button id="add-staff-button" class="btn-primary" type="button">+ Tạo tài khoản</button>',
    })}
    <div class="toolbar">
      <button id="reload-staff-button" class="btn-secondary" type="button">Tải lại</button>
    </div>
    <div class="table-card">
      <table class="data-table staff-table">
        <thead><tr><th>Nhân viên</th><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead>
        <tbody id="staff-table-body">${stateRow('Đang tải nhân viên', 'Đang đọc dữ liệu tài khoản.')}</tbody>
      </table>
    </div>
  `;
}

StaffPage.afterRender = function afterRenderStaff() {
  document.getElementById('add-staff-button')?.addEventListener('click', openCreateDialog);
  document.getElementById('reload-staff-button')?.addEventListener('click', loadStaff);
  document.getElementById('staff-table-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reset-password]');
    if (button) openResetDialog(button.dataset.resetPassword);
  });
  loadStaff();
};

async function loadStaff() {
  const body = document.getElementById('staff-table-body');
  if (!body) return;
  body.innerHTML = stateRow('Đang tải nhân viên', 'Đang đọc dữ liệu tài khoản.');
  try {
    const result = await StaffService.list();
    state.staff = result.staff || [];
    renderRows();
  } catch (error) {
    body.innerHTML = stateRow('Không tải được nhân viên', error?.message || 'Supabase trả về lỗi.');
  }
}

function renderRows() {
  const body = document.getElementById('staff-table-body');
  if (!body) return;
  if (!state.staff.length) {
    body.innerHTML = stateRow('Chưa có nhân viên', 'Tạo tài khoản nhân viên đầu tiên để bắt đầu.');
    return;
  }
  body.innerHTML = state.staff.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.displayName || '—')}</strong><br><span class="muted-text">@${escapeHtml(item.username || '—')}</span></td>
      <td>${escapeHtml(item.email || '—')}</td>
      <td>${item.role === 'admin' ? 'Admin' : 'Kiểm duyệt'}</td>
      <td><span class="badge badge-${item.isActive ? 'active' : 'inactive'}">${item.isActive ? 'Hoạt động' : 'Đã khóa'}</span></td>
      <td>${formatDateTime(item.lastSignInAt)}</td>
      <td>${item.role === 'reviewer' ? `<button class="btn-secondary compact-button" type="button" data-reset-password="${item.userId}">Đặt lại mật khẩu</button>` : '—'}</td>
    </tr>
  `).join('');
}

function openCreateDialog() {
  Modal.open({
    title: 'Tạo tài khoản nhân viên',
    body: `
      <form id="create-staff-form">
        <label class="form-group"><span>Họ và tên</span><input class="form-control" name="displayName" required maxlength="100" autocomplete="name"></label>
        <div class="form-row">
          <label class="form-group"><span>Username</span><input class="form-control" name="username" required minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" autocomplete="off"></label>
          <label class="form-group"><span>Email</span><input class="form-control" name="email" type="email" required autocomplete="email"></label>
        </div>
        <label class="form-group"><span>Mật khẩu ban đầu</span><input class="form-control" name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <p class="muted-text">Tài khoản do admin tạo được kích hoạt ngay và chỉ có quyền duyệt đơn.</p>
        <div class="modal-actions"><button class="btn-secondary" type="button" data-cancel-staff>Hủy</button><button class="btn-primary" type="submit">Tạo tài khoản</button></div>
      </form>`,
  });
  document.querySelector('[data-cancel-staff]')?.addEventListener('click', Modal.close);
  document.getElementById('create-staff-form')?.addEventListener('submit', handleCreate);
}

async function handleCreate(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  state.busy = true;
  setFormBusy(form, true);
  try {
    await StaffService.create(values);
    Modal.close();
    Toast.show('Đã tạo tài khoản nhân viên.');
    await loadStaff();
  } catch (error) {
    window.alert(error?.message || 'Không thể tạo tài khoản.');
  } finally {
    state.busy = false;
    setFormBusy(form, false);
  }
}

function openResetDialog(userId) {
  const staff = state.staff.find((item) => item.userId === userId && item.role === 'reviewer');
  if (!staff) return;
  Modal.open({
    title: 'Đặt lại mật khẩu',
    body: `
      <form id="reset-staff-password-form">
        <p>Đặt mật khẩu mới cho <strong>${escapeHtml(staff.displayName)}</strong>.</p>
        <label class="form-group"><span>Mật khẩu mới</span><input class="form-control" name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="form-group"><span>Nhập lại mật khẩu</span><input class="form-control" name="confirmation" type="password" required minlength="8" autocomplete="new-password"></label>
        <div class="modal-actions"><button class="btn-secondary" type="button" data-cancel-staff>Hủy</button><button class="btn-primary" type="submit">Lưu mật khẩu mới</button></div>
      </form>`,
  });
  document.querySelector('[data-cancel-staff]')?.addEventListener('click', Modal.close);
  document.getElementById('reset-staff-password-form')?.addEventListener('submit', (event) => handleReset(event, userId));
}

async function handleReset(event, userId) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  if (values.password !== values.confirmation) {
    window.alert('Hai lần nhập mật khẩu chưa trùng nhau.');
    return;
  }
  state.busy = true;
  setFormBusy(form, true);
  try {
    await StaffService.resetPassword(userId, values.password);
    Modal.close();
    Toast.show('Đã cập nhật mật khẩu nhân viên.');
  } catch (error) {
    window.alert(error?.message || 'Không thể đặt lại mật khẩu.');
  } finally {
    state.busy = false;
    setFormBusy(form, false);
  }
}

function setFormBusy(form, busy) {
  form?.querySelectorAll('input, button').forEach((element) => { element.disabled = busy; });
}

function formatDateTime(value) {
  if (!value) return 'Chưa đăng nhập';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function stateRow(title, message) {
  return `<tr><td colspan="6">${EmptyState({ title, message: escapeHtml(message) })}</td></tr>`;
}
