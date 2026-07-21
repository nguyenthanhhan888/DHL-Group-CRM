export function Toolbar({ children }) {
  return `<div class="toolbar">${children}</div>`;
}

export function DisabledButton({ label }) {
  return `<button class="btn-primary" type="button" disabled>${label}</button>`;
}
