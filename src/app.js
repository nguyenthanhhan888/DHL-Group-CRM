import { Modal } from './components/Modal.js';
import { Toast } from './components/Toast.js';
import { NAV_SECTIONS, PAGE_TITLES, REVIEWER_NAV_SECTIONS } from './constants/navigation.js';
import { AppLayout } from './layouts/AppLayout.js';
import { createRouter } from './router/index.js';
import { getSupabaseStatus } from './supabase/client.js';
import { AuthService } from './services/AuthService.js';
import { formatToday } from './utils/date.js';
import { BusinessTypesPage } from './pages/BusinessTypesPage.js';
import { CategoriesPage } from './pages/CategoriesPage.js';
import { CustomerDetailPage } from './pages/CustomerDetailPage.js';
import { CustomersPage } from './pages/CustomersPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { KioskDetailPage } from './pages/KioskDetailPage.js';
import { KiosksPage } from './pages/KiosksPage.js';
import { LogsPage } from './pages/LogsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { PaymentsPage } from './pages/PaymentsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegistrationRequestsPage } from './pages/RegistrationRequestsPage.js';
import { StaffPage } from './pages/StaffPage.js';

const routes = {
  dashboard: DashboardPage,
  customers: CustomersPage,
  'customer-detail': CustomerDetailPage,
  kiosks: KiosksPage,
  'kiosk-detail': KioskDetailPage,
  payments: PaymentsPage,
  categories: CategoriesPage,
  'business-types': BusinessTypesPage,
  logs: LogsPage,
  settings: SettingsPage,
  register: RegisterPage,
  reports: ReportsPage,
  'registration-requests': RegistrationRequestsPage,
  staff: StaffPage,
};

async function initApp() {
  const root = document.getElementById('app');
  if (!root) return;

  try {
    const session = await AuthService.initialize();
    const initialRoute = getRouteName();

    if (!session && initialRoute === 'register') {
      renderPublicRegistration(root);
      return;
    }

    if (!session) {
      renderLogin(root);
      return;
    }

    const profile = await AuthService.getCurrentProfile(session.user.id);
    if (!profile?.is_active) {
      await AuthService.signOut();
      renderLogin(root, 'Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
      return;
    }

    renderAuthenticatedApp(root, profile);
  } catch (error) {
    renderLogin(root, error?.message || 'Không thể khởi tạo phiên đăng nhập.');
  }
}

function renderAuthenticatedApp(root, profile) {
  const reviewer = profile.role === 'reviewer';
  const navSections = reviewer ? REVIEWER_NAV_SECTIONS : NAV_SECTIONS;
  const allowedRoutes = reviewer ? new Set(['registration-requests']) : new Set(Object.keys(routes));
  const defaultRoute = reviewer ? 'registration-requests' : 'dashboard';

  if (!allowedRoutes.has(getRouteName())) window.location.hash = `#/${defaultRoute}`;

  root.innerHTML = AppLayout({ navSections, user: profile });
  Modal.mount();
  Toast.mount();

  const sidebar = document.querySelector('[data-sidebar]');
  const outlet = document.querySelector('[data-route-outlet]');
  const pageTitle = document.querySelector('[data-page-title]');
  const currentDate = document.querySelector('[data-current-date]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const supabaseBadge = document.querySelector('[data-supabase-badge]');

  if (currentDate) currentDate.textContent = formatToday();
  updateSupabaseBadge(supabaseBadge);

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await AuthService.signOut();
    window.location.hash = '#/login';
    window.location.reload();
  });

  menuToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(sidebar?.classList.contains('open')));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') Modal.close();
  });

  createRouter({
    outlet,
    routes,
    fallback: NotFoundPage,
    defaultRoute,
    canAccess(route) {
      return allowedRoutes.has(route);
    },
    onRouteChange(route) {
      pageTitle.textContent = PAGE_TITLES[route] || PAGE_TITLES.dashboard;
      setActiveNavigation(route);
      if (window.innerWidth < 900) {
        sidebar?.classList.remove('open');
        menuToggle?.setAttribute('aria-expanded', 'false');
      }
    },
  }).start();
}

function renderLogin(root, message = '') {
  if (getRouteName() !== 'login') window.location.hash = '#/login';
  root.innerHTML = LoginPage({ message });
  LoginPage.afterRender();
}

function renderPublicRegistration(root) {
  root.innerHTML = `
    <main class="public-shell">
      <div class="public-topbar">
        <div><strong>🏪 Đăng ký Kiosk</strong><span>Diễn Châu · À Đây Rồi</span></div>
        <a href="#/login" data-open-login>Đăng nhập quản trị</a>
      </div>
      <div class="public-content" data-route-outlet></div>
    </main>
    <div class="modal-overlay hidden" data-modal-overlay>
      <div class="modal" data-modal role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div class="modal-header"><h3 id="app-modal-title" data-modal-title></h3><button class="modal-close" type="button" data-modal-close>✕</button></div>
        <div class="modal-body" data-modal-body></div>
      </div>
    </div>
    <div class="toast-container" data-toast-container aria-live="polite"></div>
  `;
  Modal.mount();
  Toast.mount();
  root.querySelector('[data-open-login]')?.addEventListener('click', (event) => {
    event.preventDefault();
    window.location.hash = '#/login';
    window.location.reload();
  });
  const outlet = root.querySelector('[data-route-outlet]');
  outlet.innerHTML = RegisterPage();
  RegisterPage.afterRender();
}

function getRouteName() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw.split(/[/?]/)[0] || '';
}

function setActiveNavigation(route) {
  const activeRoute = {
    'customer-detail': 'customers',
    'kiosk-detail': 'kiosks',
  }[route] || route;

  document.querySelectorAll('[data-nav-route]').forEach((link) => {
    const active = link.dataset.navRoute === activeRoute;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function updateSupabaseBadge(element) {
  if (!element) return;
  const status = getSupabaseStatus();
  element.textContent = status.configured ? 'Supabase sẵn sàng' : 'Chưa kết nối Supabase';
  element.classList.toggle('ready', status.configured);
}

document.addEventListener('DOMContentLoaded', initApp);
