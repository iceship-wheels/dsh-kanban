# dsh-plugin-kanban

A **project kanban** for the [DeepSeek Harness](https://deepseek-harness.github.io) sidebar,
with grouped columns that fit the window height and markdown notes with GitHub-style
checkboxes and foldable headings.

- **Left sidebar entry** — a *Kanban* row in the sidebar's global panel list (next to Plugins).
- **Project tiles** — one tile per project: title, status (Idea / Active / Paused / Done),
  group, and free-form markdown. Tile height follows its content.
- **Grouped columns** — groups such as *Work / Learn / Others* sit side by side. There is
  no column count to design: the board works out how many columns each group needs to stay
  as short as possible, and gives each group that share of the width.
- **Guaranteed tile width** — a column never gets narrower than the wide single-column
  layout (~320 px), so extra columns shorten a group without cramping its tiles. The page
  only scrolls when a group is already as wide as the window allows (`↕` indicator).
- **Nested status tag** — the status pill sits inside the title block, so a long, wrapping
  title starts its second line at the card's left edge instead of after the badge.
- **Markdown editing** — title, status and group plus a notes textarea with a
  **Write / Preview** switch. Preview is live: task checkboxes toggle their markdown
  lines on click (GitHub-comment style), completed tasks are struck through, nested lists
  keep their indentation, and `#`/`##`/`###` headings fold their sections with a large
  triangle toggle.
- **Host-side persistence** — the board lives in `$DSH_HOME/kanban/board.json`
  (`~/.dsh/kanban/board.json` by default), written atomically by the host half.

## Install

The plugin is a normal DSH bundle: it declares `dsh.bundle.patch` and `dsh.client` in
`package.json`, so the profile composes it like any other bundle. Install it into the
desktop profile from the plugin manager (an absolute path is accepted, or use the
`plugin_manager` tool with `install_bundle`):

```text
plugin_manager install_bundle -> C:\Files\Repos\dsh-kanban
```

Equivalently, from a CLI:

```bash
dsh plugin --profile desktop add C:\Files\Repos\dsh-kanban
```

Installation writes the profile dependency as a `link:` to this directory and appends
`dsh-plugin-kanban` to `dsh.profile.bundles`. The **client half hot-reloads**, but this
release bumps the host board format to version 2: the running Host half must be restarted
once to serve it. Until then the page shows a banner and keeps the grouped board in a
browser mirror, so no work is lost — restart DeepSeek Harness to persist groups.

Uninstall with `plugin_manager remove_bundle`; the board file is kept.

## Use

1. Click **Kanban** in the left sidebar.
2. **New project** (header, or the `+` on a group header) opens a tile editor. Pick status
   and group, write markdown in **Write**, check the rendering in **Preview**.
   `Ctrl+Enter` saves, `Esc` cancels.
3. **Groups** (header button) renames groups, adds and removes groups. Removing a group
   moves its tiles to the first remaining group. Column counts are not configured: they
   follow the content automatically.
4. Status filters narrow the visible tiles. A status pill cycles
   Idea → Active → Paused → Done and saves itself.
5. In a tile's rendered notes, click a task checkbox to toggle it (the markdown line is
   rewritten and saved); click a heading (or its large triangle toggle) to fold everything under it.

## Layout model

There is no configured column count. In wide mode the board measures each group's rendered
height and asks for as many columns as it would take to fit the window height:

```
needed = clamp(ceil(contentHeight ÷ availableHeight), 1, 4)   # measured at the current columns
```

The width budget then limits how many columns can sit side by side. With a 320 px minimum
column width, only `floor(availableWidth ÷ 320)` columns fit; when the groups' needs exceed
that, the columns are shared proportionally (the tallest groups get the most). Each group's
grid track is `minmax(count × 320px, count fr)`, which keeps every tile at least as wide as
the wide single-column layout while letting groups with more tiles take more of the width.

The choice uses hysteresis (only shrink when the wider layout fits comfortably) and a pass
cap, so resizing converges instead of flickering. The page scrolls only when a group is
already using the widest readable columns and still taller than the window (it then shows
`↕`). Below ~1100px the groups stack vertically and each group uses one column.

## Data model and API

```json
{
  "version": 2,
  "groups": [
    { "id": "work", "title": "Work" },
    { "id": "learn", "title": "Learn" },
    { "id": "others", "title": "Others" }
  ],
  "projects": [
    {
      "id": "welcome",
      "title": "Welcome to your board",
      "notes": "# Markdown supported\n\n- [x] done\n- [ ] todo",
      "status": "idea",
      "group": "work",
      "createdAt": "2026-11-05T09:00:00.000Z",
      "updatedAt": "2026-11-05T09:00:00.000Z"
    }
  ]
}
```

A version-1 board (no groups) migrates on read: it gets the starter groups and its projects
fall into `others` (or the first group when that id is absent). The host serves one loopback
route registered with the host web server:

| Route | Method | Meaning |
|---|---|---|
| `/dsh-kanban/api/board` | `GET` | Read the board (`{ok, board, recovered, savedAt}`) |
| `/dsh-kanban/api/board` | `POST` | Replace the board (`{ok, board, savedAt}`), normalized and written atomically |
| `/dsh-kanban/api/health` | `GET` | Liveness probe |

Requests carrying an `Origin` header must be the host's own origin or another loopback
spelling of the same listener (`localhost` / `127.0.0.1` / `[::1]`, same port). The body is
capped at 4 MiB, oversized bodies are drained and answered with 413, a corrupt board file is
moved aside once (`recovered: true`), and writes are serialized and atomic.

## Development

No build step and no runtime dependencies: `lib/client.js` is the browser bundle itself
(the `window.__ModuleLoader__` wrapper the client module system expects), and `lib/index.js`
is the host half. Client edits hot-reload; **host** edits need an app restart because the
host module listener is off by default.

```bash
npm install --ignore-scripts   # test-only React for component rendering
node test/smoke.mjs            # contracts, markdown, folding/toggling, layout solver, live route
node test/layout-harness.mjs   # writes .tmp/harness-{short,tall}.html
node tools/import-todo.mjs <TODO.md> <out.json>   # draft a board from a TODO file
```

An exported TODO such as the Feishu checklist style works: `# 任务清单` numbered
`## 开发` / `## 学习` items become idea tiles in `Work` / `Learn`, every `##` section under
`# 正在做` becomes an active tile (or `done` once all its boxes are checked), and sections
under `# 已完成` become `done` tiles. Then POST the generated JSON to the route:

```bash
curl -X POST -H "Content-Type: application/json" --data-binary @.tmp/import-board.json \
  http://127.0.0.1:<port>/dsh-kanban/api/board
```

`test/layout-harness.mjs` renders the real `GroupSection` and bundled CSS with a mocked
column count so the column widths and multi-column flow can be captured in a headless
browser for a visual check of the column layout:

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu \
  --hide-scrollbars --force-device-scale-factor=1 --window-size=1420,700 \
  --screenshot=.tmp/harness-short.png \
  "file:///C:/Files/Repos/dsh-kanban/.tmp/harness-short.html"
```

### Files

| Path | Role |
|---|---|
| `package.json` | bundle declaration: `main`, `exports["./client"]`, `dsh.bundle.patch`, `dsh.client.platform` |
| `cordis.patch.yml` | inserts the plugin row `dsh-kanban` into the profile tree |
| `lib/index.js` | host half: v2 board storage, atomic write queue, `/dsh-kanban/api` route |
| `lib/client.js` | browser half: markdown renderer/editor, groups, fit-to-height layout, sidebar + main registrations |
| `test/smoke.mjs` | contract, markdown, folding/checkbox, layout-solver, component and live-route tests |
| `test/layout-harness.mjs` | static layout harness for the grouped column engine |
| `tools/import-todo.mjs` | import a Feishu-style `TODO.md` into a board v2 JSON (keyword classification, checklists kept) |
| `tools/asar-*.cjs` | development-only reader/extractor for the installed `app.asar` |

## Design decisions

- **Sidebar entry, not a sidebar replacement.** The entry registers into
  `sidebar.panellist` (the public list seat used by Plugins) and the board registers into
  the keyed `main` slot. No official slot is shadowed, so DSH upgrades cannot orphan it.
- **One route, no Remote namespace.** Custom host↔client RPC normally goes through
  generated Typert Remotes; a personal board does not justify that build machinery, so the
  host exposes one origin-fenced loopback route under its own path prefix.
- **Hand-written bundle.** The browser bundle is committed as the loader-wrapped file
  instead of being produced by tsdown/esbuild, keeping the package dependency-free (no peer
  version gate) and making the HMR loop the whole edit cycle. A version-2 board written by
  an older host is preserved through a browser mirror until the host restarts.
- **Measured fit, not fixed columns.** The engine measures rendered group heights (via
  `ResizeObserver`) and adjusts each group's column count, letting the browser's
  multi-column layout distribute tiles; this keeps dynamic tile heights and avoids a
  masonry implementation.

## Limitations

- One global board, not one per workspace/session.
- No drag-and-drop; status pill cycles, group is a select.
- Only `#`/`##`/`###` headings fold (h4–h6 stay inline); fold state is remembered per tile
  for the current page session, not written to the board file.
- A group is only widened up to the window: tiles are never narrower than ~320 px, so a
  group with a lot of tall tiles can still be taller than the window and fall back to page
  scroll (it shows `↕`).
- Markdown field bounds keep rendering linear on pathological input: link/image labels
  longer than 300 characters, URLs longer than 2,048 characters, inline code delimiters
  longer than 16 backticks, and blockquote nesting deeper than 12 levels degrade to text.
- Closing the panel inside the ~400 ms save debounce flushes with `fetch(keepalive)`;
  browsers cap keepalive bodies at 64 KiB, so a very large board may miss that single
  close-triggered flush (normal saves are unaffected).
