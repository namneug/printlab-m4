/** Router แบบ hash (#/path) — ใช้ hash เพราะ GitHub Pages ไม่มี SPA fallback */
export type Cleanup = () => void;
export type Screen = (root: HTMLElement, params: Record<string, string>, query: URLSearchParams) => Cleanup | void;

interface Route {
  pattern: string;
  keys: string[];
  re: RegExp;
  screen: Screen;
}

const routes: Route[] = [];
let current: Cleanup | null = null;
let guard: ((path: string) => string | null) | null = null;
let rootEl: HTMLElement | null = null;

export function route(pattern: string, screen: Screen): void {
  const keys: string[] = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:([a-zA-Z]+)/g, (_m, k: string) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ pattern, keys, re, screen });
}

/** ตั้งตัวตรวจก่อนเข้าเส้นทาง คืนค่าเส้นทางใหม่ถ้าต้อง redirect หรือ null ถ้าผ่าน */
export function setGuard(fn: (path: string) => string | null): void {
  guard = fn;
}

export function navigate(path: string, replace = false): void {
  const hash = '#' + path;
  if (replace) location.replace(hash);
  else location.hash = path;
}

export function currentPath(): string {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw.split('?')[0] || '/';
}

export function currentQuery(): URLSearchParams {
  const raw = location.hash.replace(/^#/, '');
  const i = raw.indexOf('?');
  return new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '');
}

function render(): void {
  if (!rootEl) return;
  const path = currentPath();
  const redirect = guard?.(path);
  if (redirect && redirect !== path) {
    navigate(redirect, true);
    return;
  }
  current?.();
  current = null;
  rootEl.replaceChildren();
  window.scrollTo(0, 0);

  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1] ?? '');
    });
    const cleanup = r.screen(rootEl, params, currentQuery());
    current = typeof cleanup === 'function' ? cleanup : null;
    return;
  }
  navigate('/', true);
}

export function startRouter(root: HTMLElement): void {
  rootEl = root;
  window.addEventListener('hashchange', render);
  render();
}
