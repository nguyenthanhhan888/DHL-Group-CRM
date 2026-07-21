import { ConnectionNotice } from '../components/ConnectionNotice.js';
import { PageHeader } from '../components/PageHeader.js';
import { getSupabaseStatus } from '../supabase/client.js';

export function SettingsPage() {
  const status = getSupabaseStatus();

  return `
    ${PageHeader({
      title: 'Cài đặt',
      description: 'Cấu hình nền tảng cho môi trường vận hành.',
    })}
    ${ConnectionNotice()}
    <div class="admin-grid">
      <section class="admin-card">
        <h3>Supabase</h3>
        <div class="settings-list">
          ${settingRow('URL dự án', status.hasUrl ? 'Đã cấu hình' : 'Thiếu')}
          ${settingRow('Khóa anon', status.hasAnonKey ? 'Đã cấu hình' : 'Thiếu')}
          ${settingRow('SDK trình duyệt', status.hasSdk ? 'Đã tải' : 'Thiếu')}
        </div>
      </section>
      <section class="admin-card">
        <h3>Quy tắc vận hành</h3>
        <div class="settings-list">
          ${settingRow('Nguồn dữ liệu', 'Chỉ dùng Supabase')}
          ${settingRow('Thay đổi database', 'Cần phê duyệt trước')}
          ${settingRow('Logic nghiệp vụ', 'Chỉ xử lý qua lớp dịch vụ')}
        </div>
      </section>
    </div>
  `;
}

function settingRow(label, value) {
  return `
    <div class="setting-item">
      <span class="setting-name">${label}</span>
      <span class="setting-value">${value}</span>
    </div>
  `;
}
