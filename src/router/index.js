const DEFAULT_ROUTE = 'dashboard';

export function createRouter({ outlet, routes, fallback, onRouteChange }) {
  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  function render() {
    if (!outlet) return;

    const { route, params } = parseRoute(window.location.hash);
    const page = routes[route] || fallback;
    outlet.innerHTML = page({ route, params });
    onRouteChange?.(routes[route] ? route : DEFAULT_ROUTE);
    page.afterRender?.({ route, params, outlet });
  }

  return { start };
}

function parseRoute(hash) {
  const raw = hash.replace(/^#\/?/, '').trim();
  const [pathPart, queryString = ''] = raw.split('?');
  const pathSegments = pathPart.split('/').filter(Boolean);
  const route = pathSegments[0] || '';
  const params = new URLSearchParams(queryString);

  if (pathSegments.length > 1 && !params.has('id')) {
    params.set('id', pathSegments.slice(1).join('/'));
  }

  if (!route) {
    window.location.hash = `#/${DEFAULT_ROUTE}`;
    return { route: DEFAULT_ROUTE, params };
  }

  return { route, params };
}
