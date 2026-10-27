// github.com is a single-page app, so the script runs on every page and switches
// itself on and off as the URL moves in and out of a project.
(() => {
  const PROJECT_PATH = /^\/(orgs|users)\/[^/]+\/projects\/\d+/;
  const root = document.documentElement;

  let settings = { ...GPE_DEFAULTS };
  let active = false;
  let observer = null;
  let actionsObserver = null;
  let scanQueued = false;

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      if (active && settings.showNames) GpeNames.scan();
      trackActionsWidth();
      markIconOnlyButtons();
      markBoardGutters();
    });
  }

  // Top bar buttons that keep only their icon (and counter); the label moves to the tooltip.
  // CSS cannot match by text, so they are marked here.
  const ICON_ONLY_LABELS = new Set(['Insights', 'Updates', 'Workflows']);
  function markIconOnlyButtons() {
    const labels = document.querySelectorAll(
      '[role="navigation"][aria-label="Project"] :is(a, button):has([data-component="leadingVisual"]) [data-component="text"]');
    for (const label of labels) {
      const text = label.textContent.trim();
      if (!ICON_ONLY_LABELS.has(text)) continue;
      const button = label.closest('a, button');
      button.classList.add('gpe-icon-only');
      button.title = text;
    }
  }

  // The board and the filter bar above it sit in containers with wide side padding.
  // Their classes are hashed, so the padded ones are found by walking up from the
  // board and from the filter input, and marked for content.css to narrow.
  const GUTTER_MIN = 16;
  function markBoardGutters() {
    const viewRoot = document.getElementById('memex-project-view-root');
    const board = viewRoot?.querySelector('[data-board-column]');
    root.classList.toggle('gpe-board', Boolean(board));
    if (!board) return;
    const filter = document.getElementById('filter-bar-component-input');
    for (const start of [board, filter]) {
      for (let el = start?.parentElement; el && el !== viewRoot; el = el.parentElement) {
        if (el.classList.contains('gpe-gutter')) continue;
        const style = getComputedStyle(el);
        if (parseFloat(style.paddingLeft) >= GUTTER_MIN || parseFloat(style.paddingRight) >= GUTTER_MIN) {
          el.classList.add('gpe-gutter');
        }
      }
    }
  }

  // The lifted tabs must not run under the action buttons, whose width depends
  // on the user's permissions (status update, workflows and so on).
  let trackedActions = null;
  function trackActionsWidth() {
    const actions = document.querySelector('[role="navigation"][aria-label="Project"]');
    if (actions === trackedActions) return;
    trackedActions = actions;
    actionsObserver?.disconnect();
    if (!actions) return;
    actionsObserver = new ResizeObserver(() => {
      root.style.setProperty('--gpe-actions-width', `${actions.offsetWidth + 16}px`);
    });
    actionsObserver.observe(actions);
  }

  function applySettings() {
    root.classList.toggle('gpe-active', active);
    root.classList.toggle('gpe-compact-header', active && settings.compactHeader);
    root.style.setProperty('--gpe-column-scale', String(settings.columnWidth / 100));

    if (active && settings.showNames) {
      GpeNames.enable(queueScan).then(queueScan);
    } else {
      GpeNames.disable();
    }
  }

  function setActive(value) {
    if (value === active) return;
    active = value;
    if (active) {
      observer = new MutationObserver(queueScan);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      observer?.disconnect();
      observer = null;
    }
    applySettings();
  }

  function checkLocation() {
    setActive(PROJECT_PATH.test(location.pathname));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue ?? GPE_DEFAULTS[key];
    }
    applySettings();
  });

  gpeLoadSettings().then(loaded => {
    settings = loaded;
    checkLocation();
    applySettings();
    // Cheaper and more reliable than hooking GitHub's router events.
    setInterval(checkLocation, 500);
  });
})();
