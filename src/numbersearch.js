// A small "#" field next to the filter bar that finds items by their issue or pull
// request number, in the board and in the table. GitHub's filter matches titles only.
//
// Matching items are outlined and the rest are dimmed rather than hidden: both views
// render only the items in sight, and hiding would break their scroll layout. The first
// match scrolls into view; Enter opens it, Escape clears the field.
//
// In the table, sub-issues of a collapsed parent are not drawn at all. When the number
// is not among the drawn rows, the sub-issues of the collapsed parents are fetched the
// way the table itself does when a row is expanded, and the parent holding the number
// is expanded. Parents expanded this way collapse again when the number changes.
const GpeNumberSearch = (() => {
  const FIELD_CLASS = 'gpe-number-search';
  const ON_CLASS = 'gpe-number-searching';
  const MATCH_CLASS = 'gpe-number-match';
  const ROWS = '#memex-project-view-root [role="row"]:has([role="gridcell"])';
  const ITEMS = `[data-board-card-id], ${ROWS}`;
  const LINK_RE = /\/(?:issues|pull)\/(\d+)(?:[/?#]|$)/;
  const ISSUE_RE = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:[/?#]|$)/;
  const TEXT_RE = /#(\d+)\b/;
  const SUB_ISSUES_DELAY = 400;
  const SUB_ISSUES_DEPTH = 3;
  const CACHE_TTL = 60 * 1000;
  const root = document.documentElement;

  let enabled = false;
  let field = null;
  let query = '';
  let scrollPending = false;
  let lookupTimer = 0;
  let lookupId = 0;
  const expanded = new Set();     // refs of parents this search expanded
  const subIssues = new Map();    // "ref q" -> { time, promise of [{ ref, number, hasChildren }] }

  function itemNumber(item) {
    for (const link of item.querySelectorAll('a[href]')) {
      const match = LINK_RE.exec(link.getAttribute('href'));
      if (match) return match[1];
    }
    return TEXT_RE.exec(item.textContent)?.[1] ?? null;
  }

  // "owner/repo#123" of a table row's issue, the form the sub-issues endpoint takes.
  function rowRef(row) {
    for (const link of row.querySelectorAll('a[href]')) {
      const match = ISSUE_RE.exec(link.href);
      if (match) return `${match[1]}#${match[2]}`;
    }
    return null;
  }

  function matches() {
    return [...document.querySelectorAll(ITEMS)].filter(item => item.classList.contains(MATCH_CLASS));
  }

  function mark() {
    root.classList.toggle(ON_CLASS, Boolean(query));
    for (const item of document.querySelectorAll(ITEMS)) {
      item.classList.toggle(MATCH_CLASS, Boolean(query) && itemNumber(item)?.startsWith(query) === true);
    }
    if (scrollPending) {
      const first = matches()[0];
      if (first) {
        scrollPending = false;
        first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  function subIssuesUrl() {
    try {
      return JSON.parse(document.getElementById('memex-items-sub-issues-api-data')?.textContent ?? 'null')?.url ?? null;
    } catch {
      return null;
    }
  }

  // The table filters the sub-issues it shows with the view's filter, so the same one is passed.
  function fetchSubIssues(ref) {
    const filter = document.getElementById('filter-bar-component-input')?.value.trim() ?? '';
    const key = `${ref} ${filter}`;
    const cached = subIssues.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.promise;
    const base = subIssuesUrl();
    if (!base) return Promise.resolve([]);
    const url = new URL(base, location.origin);
    url.searchParams.set('nwoReference', ref);
    if (filter) url.searchParams.set('q', filter);
    const promise = fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(response => (response.ok ? response.json() : { nodes: [] }))
      .then(data => (data.nodes ?? []).map(node => {
        const value = id => node.memexProjectColumnValues?.find(v => v.memexProjectColumnId === id)?.value;
        const number = value('Title')?.number;
        const repo = value('Repository')?.nameWithOwner;
        return {
          ref: repo && number ? `${repo}#${number}` : null,
          number: number ? String(number) : null,
          hasChildren: Boolean(value('Sub-issues progress')),
        };
      }))
      .catch(() => []);
    subIssues.set(key, { time: Date.now(), promise });
    return promise;
  }

  async function holds(ref, number, depth) {
    for (const child of await fetchSubIssues(ref)) {
      if (child.number === number) return true;
      if (child.hasChildren && child.ref && depth > 1 && await holds(child.ref, number, depth - 1)) return true;
    }
    return false;
  }

  function findRow(ref) {
    return [...document.querySelectorAll(ROWS)].find(row => rowRef(row) === ref) ?? null;
  }

  function toggleRow(row, label) {
    row?.querySelector(`button[aria-label="${label}"]`)?.click();
  }

  function collapseExpanded() {
    for (const ref of expanded) toggleRow(findRow(ref), 'Collapse');
    expanded.clear();
  }

  // Expands the collapsed parents whose sub-issues (to a few levels) hold the number.
  // Runs again after each expansion, for a number further down the tree.
  async function lookUpSubIssues(id) {
    if (id !== lookupId || !query) return;
    const number = query;
    if (matches().some(item => itemNumber(item) === number)) return;
    const parents = [...document.querySelectorAll(ROWS)]
      .filter(row => row.querySelector('button[aria-label="Expand"]'))
      .map(rowRef)
      .filter(Boolean);
    for (const ref of parents) {
      if (!(await holds(ref, number, SUB_ISSUES_DEPTH))) continue;
      if (id !== lookupId) return;
      toggleRow(findRow(ref), 'Expand');
      expanded.add(ref);
      scrollPending = true;
      setTimeout(() => lookUpSubIssues(id), SUB_ISSUES_DELAY);
      return;
    }
  }

  function search(value) {
    query = value;
    lookupId++;
    clearTimeout(lookupTimer);
    collapseExpanded();
    scrollPending = Boolean(query);
    mark();
    if (query && document.querySelector(ROWS)) {
      const id = lookupId;
      lookupTimer = setTimeout(() => lookUpSubIssues(id), SUB_ISSUES_DELAY);
    }
  }

  // Board cards open through the panel URL (a synthetic click on a card does nothing);
  // table rows through their title link.
  function openItem(item) {
    const id = item.dataset.boardCardId;
    if (id) {
      const url = new URL(location.href);
      url.searchParams.set('pane', 'issue');
      url.searchParams.set('itemId', id);
      history.pushState(history.state, '', url);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      return;
    }
    const link = [...item.querySelectorAll('a[href]')].find(a => LINK_RE.test(a.getAttribute('href')));
    (link ?? item.querySelector('button'))?.click();
  }

  function makeField() {
    const input = document.createElement('input');
    input.type = 'search';
    input.className = FIELD_CLASS;
    input.placeholder = '#';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.title = 'Find an item by its number';
    input.setAttribute('aria-label', 'Find an item by its number');
    input.value = query;
    input.addEventListener('input', () => search(input.value.replace(/\D/g, '')));
    input.addEventListener('keydown', event => {
      event.stopPropagation();  // GitHub's view shortcuts must not fire while typing
      if (event.key === 'Enter') {
        const first = matches()[0];
        if (first) openItem(first);
      } else if (event.key === 'Escape') {
        input.value = '';
        search('');
      }
    });
    return input;
  }

  // Before the whole filter bar, in the row it shares with the View button. Walking up
  // from the filter form control to the first row with more than one child keeps the
  // field out of the filter box itself, whose icon and clear button are laid over it.
  function placeField() {
    if (field?.isConnected) return;
    const filter = document.getElementById('filter-bar-component-input');
    if (!filter) return;
    let anchor = filter.closest('.FormControl') ?? filter.parentElement;
    for (let depth = 0; anchor.parentElement && depth < 6; anchor = anchor.parentElement, depth++) {
      const parent = anchor.parentElement;
      const style = getComputedStyle(parent);
      if (parent.children.length > 1 && style.display.includes('flex') && !style.flexDirection.startsWith('column')) break;
    }
    field ??= makeField();
    anchor.before(field);
  }

  function scan() {
    if (!enabled) return;
    placeField();
    if (query) mark();
  }

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      field?.remove();
      field = null;
      lookupId++;
      clearTimeout(lookupTimer);
      query = '';
      expanded.clear();
      root.classList.remove(ON_CLASS);
      for (const item of document.querySelectorAll(`.${MATCH_CLASS}`)) item.classList.remove(MATCH_CLASS);
    },
    scan,
  };
})();
