export function AppLayout({ navSections }) {
  return `
    <div class="app-shell">
      <aside class="sidebar" data-sidebar>
        <div class="sidebar-logo">
          <div class="logo-mark">🏪</div>
          <div>
            <div class="sidebar-title">Quản lý Kiosk</div>
            <div class="sidebar-sub">Diễn Châu · À Đây Rồi</div>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Điều hướng chính">
          ${navSections.map(renderNavSection).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="user-avatar">A</div>
          <div>
            <div class="user-name">Admin</div>
            <div class="user-role">Môi trường vận hành</div>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <header class="top-bar">
          <div class="top-bar-left">
            <button class="icon-button" type="button" data-menu-toggle aria-label="Mở menu" aria-expanded="false">☰</button>
            <div class="page-title" data-page-title>Tổng quan</div>
          </div>
          <div class="top-bar-right">
            <span class="connection-badge" data-supabase-badge>Chưa kết nối Supabase</span>
            <span class="current-date" data-current-date></span>
          </div>
        </header>
        <div class="page-content" data-route-outlet></div>
      </main>
    </div>

    <div class="modal-overlay hidden" data-modal-overlay>
      <div class="modal" data-modal role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div class="modal-header">
          <h3 id="app-modal-title" data-modal-title></h3>
          <button class="modal-close" type="button" data-modal-close aria-label="Đóng">✕</button>
        </div>
        <div class="modal-body" data-modal-body></div>
      </div>
    </div>

    <div class="toast-container" data-toast-container aria-live="polite" aria-atomic="true"></div>
  `;
}

function renderNavSection(section) {
  return `
    <div class="nav-section">
      <div class="nav-section-label">${section.label}</div>
      ${section.items.map(renderNavItem).join('')}
    </div>
  `;
}

function renderNavItem(item) {
  return `
    <a href="#/${item.route}" class="nav-item" data-nav-route="${item.route}">
      <span class="nav-icon" aria-hidden="true">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `;
}
