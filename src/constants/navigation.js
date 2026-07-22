export const PAGE_TITLES = {
  dashboard: 'Tổng quan',
  customers: 'Khách hàng',
  'customer-detail': 'Chi tiết khách hàng',
  kiosks: 'Kiosk',
  'kiosk-detail': 'Chi tiết Kiosk',
  payments: 'Thanh toán',
  categories: 'Danh mục',
  'business-types': 'Loại hình KD',
  logs: 'Lịch sử thay đổi',
  settings: 'Cài đặt',
  register: 'Đăng ký trực tuyến',
  'registration-requests': 'Duyệt đơn đăng ký',
  reports: 'Báo cáo',
};

export const NAV_SECTIONS = [
  {
    label: 'Tổng quan',
    items: [
      { route: 'dashboard', label: 'Tổng quan', icon: '📊' },
      { route: 'reports', label: 'Báo cáo', icon: '📈' },
    ],
  },
  {
    label: 'Quản lý',
    items: [
      { route: 'customers', label: 'Khách hàng', icon: '👥' },
      { route: 'kiosks', label: 'Kiosk', icon: '🏪' },
      { route: 'payments', label: 'Thanh toán', icon: '💰' },
      { route: 'categories', label: 'Danh mục', icon: '🏷️' },
      { route: 'business-types', label: 'Loại hình KD', icon: '🧾' },
      { route: 'registration-requests', label: 'Duyệt đăng ký', icon: '✅' },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { route: 'logs', label: 'Lịch sử', icon: '🕘' },
      { route: 'settings', label: 'Cài đặt', icon: '⚙️' },
    ],
  },
];

export const REVIEWER_NAV_SECTIONS = [
  {
    label: 'Kiểm duyệt',
    items: [
      { route: 'registration-requests', label: 'Duyệt đăng ký', icon: '✅' },
    ],
  },
];
