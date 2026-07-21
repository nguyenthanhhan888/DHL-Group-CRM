import { Modal } from './components/Modal.js';
import { Toast } from './components/Toast.js';
import { NAV_SECTIONS, PAGE_TITLES } from './constants/navigation.js';
import { AppLayout } from './layouts/AppLayout.js';
import { createRouter } from './router/index.js';
import { getSupabaseStatus } from './supabase/client.js';
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
};

function initApp() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = AppLayout({ navSections: NAV_SECTIONS });
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
