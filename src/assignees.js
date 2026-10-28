// A small button on board cards that opens GitHub's own "Select assignees" picker
// next to the card, the way Jira lets you reassign from the board.
//
// The picker only exists inside the item side panel, so the button opens the panel
// through its URL, hides it, presses the panel's "Edit Assignees" gear and moves the
// picker next to the card. When the picker closes (and GitHub saves the change),
// the hidden panel is closed too.
const GpeAssignees = (() => {
  const BUTTON_CLASS = 'gpe-assign-button';
  const MODE_CLASS = 'gpe-assigning';
  const PLACED_CLASS = 'gpe-assign-placed';
  const GHOST_CLASS = 'gpe-assign-ghost';
  const PANEL = '[role="dialog"][aria-label^="Side panel"]';
  const PICKER = `${PANEL} [role="dialog"][data-component="AnchoredOverlay"]`;
  const WAIT_LIMIT = 3000;
  const SETTLE_LIMIT = 1000;
  const STILL_FRAMES = 3;
  const root = document.documentElement;

  let enabled = false;
  let busy = false;

  function makeButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.title = 'Change assignees';
    button.setAttribute('aria-label', 'Change assignees');
    button.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'
      + '<path fill="currentColor" d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>'
      + '</svg>';
    // The card is draggable and opens the panel on click: keep both away from the button.
    for (const type of ['pointerdown', 'mousedown', 'keydown']) {
      button.addEventListener(type, event => event.stopPropagation());
    }
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      open(button.closest('[data-board-card-id]'));
    });
    return button;
  }

  // In the slot the avatars go to, at the right end of the card header, before the
  // avatars if there are any. "Header__" is a CSS module prefix: the hash after it changes.
  function placeButton(card) {
    if (card.querySelector(`.${BUTTON_CLASS}`)) return;
    const slot = card.querySelector('[data-component="AvatarStack"]')?.closest('figure')?.parentElement
      ?? card.querySelector('[class*="Header__"] > div > :last-child');
    slot?.prepend(makeButton());
  }

  function scan() {
    if (!enabled) return;
    for (const card of document.querySelectorAll('[data-board-card-id]')) placeButton(card);
  }

  function waitFor(find) {
    return new Promise(resolve => {
      const start = performance.now();
      (function poll() {
        const found = find();
        if (found || performance.now() - start > WAIT_LIMIT) resolve(found ?? null);
        else requestAnimationFrame(poll);
      })();
    });
  }

  function editButton() {
    return [...document.querySelectorAll(`${PANEL} button`)]
      .find(button => button.textContent.trim() === 'Edit Assignees');
  }

  // Found by its tooltip: the panel also has a "Close issue" button, which must not be pressed.
  function closePanel() {
    const close = [...document.querySelectorAll(`${PANEL} button:has(svg.octicon-x)`)]
      .find(button => document.getElementById(button.getAttribute('aria-labelledby'))?.textContent === 'Close panel');
    close?.click();
  }

  // Resolves when the panel's finite animations and transitions have ended, plus one
  // frame for the last shift. Endless ones such as loading spinners are skipped;
  // SETTLE_LIMIT caps the wait. The copy of the picker covers the time it takes.
  function settle(picker) {
    const panel = picker.closest(PANEL);
    const running = panel.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity)
      .map(animation => animation.finished.catch(() => {}));
    const limit = new Promise(resolve => setTimeout(resolve, SETTLE_LIMIT));
    return Promise.race([Promise.all(running), limit])
      .then(() => new Promise(requestAnimationFrame));
  }

  // A look-only copy of the picker, outside the panel, so it can sit at window coordinates.
  function makeGhost(picker, left, top) {
    const ghost = picker.cloneNode(true);
    ghost.classList.add(GHOST_CLASS);
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('role');
    for (const el of [ghost, ...ghost.querySelectorAll('[id]')]) el.removeAttribute('id');
    ghost.style.setProperty('left', `${left}px`, 'important');
    ghost.style.setProperty('top', `${top}px`, 'important');
    return ghost;
  }

  // The panel is transformed, so the fixed picker is placed relative to it, not to the
  // window. Measure where it lands and shift by the difference; repeated every frame
  // because the panel slides in. The shift cannot keep up with the slide, so the picker
  // stays invisible until the CSS animations end and it holds still for a few frames:
  // part of the slide is driven by script, which getAnimations() does not see, and on
  // the first open the slide can start late, so it hides again whenever it moves.
  // Meanwhile a static copy of it stands in at the final place, so nothing flies or lags.
  function trackPicker(card, picker) {
    let x = 0;
    let y = 0;
    let settled = false;
    let stillFrames = 0;
    let ghost = null;
    const start = performance.now();
    settle(picker).then(() => { settled = true; });
    return new Promise(resolve => {
      (function frame() {
        if (!picker.isConnected) {
          ghost?.remove();
          resolve();
          return;
        }
        const cardRect = card.getBoundingClientRect();
        const anchor = (card.querySelector(`.${BUTTON_CLASS}`) ?? card).getBoundingClientRect();
        const rect = picker.getBoundingClientRect();
        const wantX = Math.max(8, Math.min(cardRect.right, innerWidth - 8) - rect.width);
        let wantY = anchor.bottom + 4;
        if (wantY + rect.height > innerHeight - 8) wantY = Math.max(8, anchor.top - 4 - rect.height);
        const dx = wantX - rect.left;
        const dy = wantY - rect.top;
        x += dx;
        y += dy;
        root.style.setProperty('--gpe-assign-x', `${x}px`);
        root.style.setProperty('--gpe-assign-y', `${y}px`);
        stillFrames = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 ? stillFrames + 1 : 0;
        const ready = (settled && stillFrames >= STILL_FRAMES) || performance.now() - start > SETTLE_LIMIT;
        root.classList.toggle(PLACED_CLASS, ready);
        if (ready) {
          ghost?.remove();
          ghost = null;
        } else {
          // Copied again every frame: the list may still be filling in.
          const copy = makeGhost(picker, wantX, wantY);
          if (ghost) ghost.replaceWith(copy);
          else document.body.append(copy);
          ghost = copy;
        }
        requestAnimationFrame(frame);
      })();
    });
  }

  async function open(card) {
    if (!card || busy) return;
    busy = true;
    root.classList.add(MODE_CLASS);
    try {
      // GitHub's router listens to popstate, so this opens the panel the way a click on the card does.
      const url = new URL(location.href);
      url.searchParams.set('pane', 'issue');
      url.searchParams.set('itemId', card.dataset.boardCardId);
      history.pushState(history.state, '', url);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));

      const edit = await waitFor(editButton);
      if (!edit) return;  // no access, or not an item with assignees: leave the panel open
      edit.click();
      const picker = await waitFor(() => document.querySelector(PICKER));
      if (!picker) return;
      await trackPicker(card, picker);
      closePanel();
      // The panel animates out: keep it hidden until it is gone.
      await waitFor(() => !document.querySelector(PANEL));
    } finally {
      root.classList.remove(MODE_CLASS, PLACED_CLASS);
      busy = false;
    }
  }

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) button.remove();
    },
    scan,
  };
})();
