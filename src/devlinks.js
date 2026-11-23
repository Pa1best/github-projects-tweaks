// The Development picker ("Link a branch, pull request, or create a branch") lists
// merged pull requests among the open ones. They are hidden behind a "Show merged"
// switch at the top of the picker, off by default. Linked (checked) ones always stay.
const GpeDevLinks = (() => {
  const PICKER_CLASS = 'gpe-dev-picker';
  const HIDE_CLASS = 'gpe-hide-merged';
  const MERGED_CLASS = 'gpe-merged';
  const TOGGLE_CLASS = 'gpe-merged-toggle';
  const SEARCH = 'input[placeholder^="Search pull requests" i], input[placeholder^="Search branches" i]';
  const MERGED_ICON = 'svg.octicon-git-merge';

  let enabled = false;
  let showMerged = false;
  let observer = null;
  let queued = false;

  function isChecked(item) {
    return item.matches('[aria-selected="true"], [aria-checked="true"]')
      || Boolean(item.querySelector('[aria-selected="true"], [aria-checked="true"], input[type="checkbox"]:checked'));
  }

  function makeToggle() {
    const label = document.createElement('label');
    label.className = TOGGLE_CLASS;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = showMerged;
    box.addEventListener('change', () => {
      showMerged = box.checked;
      gpeSaveSettings({ devShowMerged: showMerged });
      scan();
    });
    label.append(box, 'Show merged');
    // The picker closes or moves focus on some keys and clicks: keep them here.
    for (const type of ['keydown', 'mousedown', 'pointerdown']) {
      label.addEventListener(type, event => event.stopPropagation());
    }
    return label;
  }

  function scan() {
    queued = false;
    for (const input of document.querySelectorAll(SEARCH)) {
      const picker = input.closest('[role="dialog"], [data-component="AnchoredOverlay"]');
      if (!picker) continue;
      picker.classList.add(PICKER_CLASS);
      picker.classList.toggle(HIDE_CLASS, !showMerged);
      let toggle = picker.querySelector(`.${TOGGLE_CLASS}`);
      if (!toggle) picker.append(toggle = makeToggle());
      toggle.querySelector('input').checked = showMerged;
      for (const icon of picker.querySelectorAll(MERGED_ICON)) {
        const item = icon.closest('li, [role="option"]');
        item?.classList.toggle(MERGED_CLASS, !isChecked(item));
      }
    }
  }

  function queueScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }

  function cleanup() {
    for (const el of document.querySelectorAll(`.${TOGGLE_CLASS}`)) el.remove();
    for (const el of document.querySelectorAll(`.${MERGED_CLASS}`)) el.classList.remove(MERGED_CLASS);
    for (const el of document.querySelectorAll(`.${PICKER_CLASS}`)) el.classList.remove(PICKER_CLASS, HIDE_CLASS);
  }

  return {
    // Works on every GitHub page: the same picker is in issues as well as in projects.
    setEnabled(value, show) {
      showMerged = show;
      if (value === enabled) {
        if (enabled) queueScan();
        return;
      }
      enabled = value;
      if (enabled) {
        observer = new MutationObserver(queueScan);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-checked'] });
        queueScan();
      } else {
        observer?.disconnect();
        observer = null;
        cleanup();
      }
    },
  };
})();
