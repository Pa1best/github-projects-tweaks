// Replaces GitHub logins shown next to avatars with the name from the user's profile.
//
// Names come from the hovercard endpoint GitHub itself uses for user popups: it is
// same-origin, works with the current session and has no API rate limit.
const GpeNames = (() => {
  const CACHE_KEY = 'gpeNames';
  const NAME_TTL = 7 * 24 * 3600 * 1000;
  const MISS_TTL = 24 * 3600 * 1000;
  const MAX_PARALLEL = 4;
  const LOGIN_RE = /^(?!\d+$)[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

  let cache = {};           // login -> { name: string | null, time: number }
  let cacheLoaded = null;
  const pending = new Set();
  const queue = [];
  let running = 0;

  // Text nodes we changed: node -> { login text, text we wrote }.
  const replaced = new Map();

  let enabled = false;
  let onResolved = () => {};

  // The popup clears the cache directly in storage.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && CACHE_KEY in changes && changes[CACHE_KEY].newValue === undefined) cache = {};
  });

  function loadCache() {
    cacheLoaded ??= chrome.storage.local.get(CACHE_KEY).then(r => { cache = r[CACHE_KEY] ?? {}; });
    return cacheLoaded;
  }

  function lookup(login) {
    const entry = cache[login.toLowerCase()];
    if (!entry) return undefined;
    const ttl = entry.name ? NAME_TTL : MISS_TTL;
    return Date.now() - entry.time < ttl ? entry.name : undefined;
  }

  function request(login) {
    const key = login.toLowerCase();
    if (pending.has(key)) return;
    pending.add(key);
    queue.push(login);
    pump();
  }

  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      const login = queue.shift();
      running++;
      fetchName(login)
        .then(name => {
          cache[login.toLowerCase()] = { name, time: Date.now() };
          chrome.storage.local.set({ [CACHE_KEY]: cache });
          if (name) onResolved();
        })
        .catch(() => {})  // network error: try again on the next scan
        .finally(() => {
          pending.delete(login.toLowerCase());
          running--;
          pump();
        });
    }
  }

  async function fetchName(login) {
    const response = await fetch(`/users/${encodeURIComponent(login)}/hovercard`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' },
      credentials: 'same-origin',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`hovercard ${response.status}`);

    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const link = [...doc.querySelectorAll('a.Link--secondary')]
      .find(a => a.getAttribute('href')?.toLowerCase() === `/${login.toLowerCase()}`);
    return link?.textContent.trim() || null;
  }

  // "login" or "login1, login2" -> names, or null when nothing changes.
  function translate(text) {
    const parts = text.split(/(\s*,\s*)/);
    let changed = false;
    const out = parts.map((part, i) => {
      if (i % 2) return part;  // separator
      if (!LOGIN_RE.test(part)) return part;
      const name = lookup(part);
      if (name === undefined) request(part);
      if (!name) return part;
      changed = true;
      return name;
    });
    return changed ? out.join('') : null;
  }

  function isLoginList(text) {
    return text.split(/\s*,\s*/).every(part => LOGIN_RE.test(part));
  }

  function processTextNode(node) {
    const value = node.nodeValue;
    const record = replaced.get(node);
    if (record && record.written === value) return;  // still ours

    const text = value.trim();
    if (!text || !isLoginList(text)) return;

    const translated = translate(text);
    if (translated === null) return;

    const written = value.replace(text, translated);
    replaced.set(node, { original: value, written });
    node.nodeValue = written;
    node.parentElement?.setAttribute('title', text);
  }

  // Logins are shown as text next to an avatar: table cells, group headers,
  // the slice panel, menus. Only text in the avatar's container is touched.
  function scan(root = document) {
    if (!enabled) return;
    for (const img of root.querySelectorAll('img[data-testid="github-avatar"], img.avatar')) {
      const container = img.parentElement;
      if (!container) continue;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) processTextNode(walker.currentNode);
    }
    for (const node of replaced.keys()) {
      if (!node.isConnected) replaced.delete(node);
    }
  }

  function restore() {
    for (const [node, record] of replaced) {
      if (node.isConnected && node.nodeValue === record.written) {
        node.nodeValue = record.original;
        node.parentElement?.removeAttribute('title');
      }
    }
    replaced.clear();
  }

  return {
    async enable(rescan) {
      onResolved = rescan;
      await loadCache();
      enabled = true;
    },
    disable() {
      enabled = false;
      restore();
    },
    scan,
  };
})();
