# GitHub Projects Tweaks

A Chrome extension that makes GitHub Projects boards easier to work with. It only acts on `github.com/orgs/*/projects/*` and `github.com/users/*/projects/*` pages; the rest of github.com is left alone.

## Overview

### Board

The project title is gone, the view tabs and buttons share one row, and the narrower columns fit the whole board on screen.

**Before**

![Board before](docs/screenshots/overview-board-before.jpg)

**After**

![Board after](docs/screenshots/overview-board-after.jpg)

### Table

The same compact header, and assignees show profile names instead of logins.

**Before**

![Table before](docs/screenshots/overview-table-before.jpg)

**After**

![Table after](docs/screenshots/overview-table-after.jpg)

## What it changes

### Compact header

- The project title is hidden: the breadcrumb at the top already shows it.
- The view tabs move up into its place, and the action buttons sit on the same row, vertically centred.
- A little breathing room (3 px) stays above the tabs.
- The global GitHub header has 25% less vertical padding (12 px instead of 16 px).
- Together this gives the board about 50 px more height.

**Before**

![Header before](docs/screenshots/header-before.png)

**After**

![Header after](docs/screenshots/header-after.png)

### Top bar buttons

- **Insights**, **Updates** and **Workflows** show only their icon; Workflows keeps its counter. The label moves to the tooltip.
- The icon-only **Project details** button gets a **Readme** label, since that is what it opens.

| Before | After |
|---|---|
| <img src="docs/screenshots/buttons-before.png" alt="Buttons before" width="187"> | <img src="docs/screenshots/buttons-after.png" alt="Buttons after" width="194"> |

### Narrower board columns

- Column width is adjustable from 50% to 100% of GitHub's fixed 350 px, 80% by default.
- More columns fit on the screen, so there is less scrolling left and right.
- The font size stays the same; long titles wrap onto more lines instead.

**Before**

![Columns before](docs/screenshots/columns-before.png)

**After**

![Columns after](docs/screenshots/columns-after.png)

### Profile names instead of logins

- Wherever GitHub prints a login next to an avatar (table cells, group headers, the slice panel), the name from the user's GitHub profile is shown: `beth-panx` → Beth Pan, `gegao18` → George Gao.
- The login stays in the tooltip.
- Users without a name in their profile keep their login.

| Before | After |
|---|---|
| <img src="docs/screenshots/names-before.png" alt="Logins before" width="204"> | <img src="docs/screenshots/names-after.png" alt="Names after" width="203"> |

### Settings

All of it can be tuned or switched off in the extension popup:

<img src="docs/screenshots/popup.jpg" alt="Settings popup" width="386">

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top right corner.
3. Click **Load unpacked** and select this folder.
4. Pin the extension icon to the toolbar and open any project board.

Settings are in the extension popup (click the icon). They apply immediately and sync across your Chrome browsers.

After pulling changes, click **Reload** on the extension card in `chrome://extensions` and reload the project page.

## How it works

| File | Purpose |
|---|---|
| `src/content.js` | Turns itself on for project pages (GitHub is a single-page app, so the URL is checked every 0.5 s), puts classes on `<html>`, watches the DOM |
| `src/content.css` | Column width and compact header |
| `src/names.js` | Replaces logins with profile names |
| `src/settings.js` | Default settings shared by the page and the popup |
| `popup/` | Settings popup |

Names come from the same user card GitHub shows on hover (`/users/{login}/hovercard`): the request uses your session, needs no token and has no API rate limit. Names are cached for 7 days; **Refresh names** clears the cache.

GitHub's class names are generated and change between releases, so the selectors rely on ids, roles and data attributes (`[data-board-column]`, `[role="navigation"][aria-label="Project"]`, `#memex-project-view-root`, `img[data-testid="github-avatar"]`). If something stops working after a GitHub update, start there.
