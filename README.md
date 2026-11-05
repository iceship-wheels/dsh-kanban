# dsh-plugin-kanban

A project kanban board for the DeepSeek Harness sidebar: markdown project tiles in grouped
columns that fit the window, with checklists and foldable headings.

This README is the deploy guide. The plugin has no runtime dependencies and no build step;
`lib/` is the shipped code.

## Requirements

- DeepSeek Harness desktop (the plugin installs into the `desktop` profile)
- Node.js 20.11+ only for running the tests (`import.meta.dirname`); DSH provides React
  at runtime

## Install

Recommended: install the folder as a bundle with the plugin manager (UI, or the
`plugin_manager` tool):

```text
plugin_manager install_bundle C:\path\to\dsh-kanban
```

Or from a CLI:

```bash
dsh plugin --profile desktop add C:\path\to\dsh-kanban
```

Either way the profile gets a `link:` dependency on this folder plus `dsh-plugin-kanban`
in `dsh.profile.bundles`, so editing/replacing the folder is enough to upgrade.

Manual alternative: add this to the dependencies of
`~/.dsh/profiles/desktop/package.json` and append the package name to `dsh.profile.bundles`:

```json
"dsh-plugin-kanban": "link:C:/path/to/dsh-kanban"
```

## After install or upgrade: restart once

The plugin has a host half that serves the board file. Restart DeepSeek Harness so it
loads. Until then the board shows a banner and keeps your changes in the window; they are
persisted on the next host restart.

## Verify

1. A **Kanban** entry appears in the left sidebar.
2. Open it, click **New project**, write markdown, save.
3. Header has **Groups** (rename/add/remove groups) and status filters.
4. The board is saved to `$DSH_HOME/kanban/board.json` (`~/.dsh/kanban/board.json` by
   default). Back up that file before upgrading if the board matters.

## Upgrade

```bash
git pull          # or replace the folder
```

Restart DeepSeek Harness. A linked install needs no reinstall; a version-1 board file
migrates automatically when read.

## Uninstall

```text
plugin_manager remove_bundle dsh-plugin-kanban
```

or:

```bash
dsh plugin --profile desktop remove dsh-plugin-kanban
```

The board file is kept. Delete `~/.dsh/kanban/board.json` to reset the board.

## Troubleshooting

- **No sidebar entry**: confirm `dsh-plugin-kanban` is in the profile's
  `dsh.profile.bundles` and `dsh-plugin-kanban` resolves in the profile's `node_modules`;
  then restart DSH.
- **Banner says the host half is outdated**: restart DeepSeek Harness.
- **Board file unreadable**: the host moves the corrupt file aside and starts an empty
  board; restore your backup if needed.
- **Nothing loads after an upgrade**: restart DSH once; the browser half is cached per
  app start.

## Development

```bash
npm install --ignore-scripts
node test/smoke.mjs            # unit, component and live-route tests
node test/layout-harness.mjs   # writes .tmp/harness-{short,tall}.html
```

`lib/client.js` is the browser bundle (loaded through `window.__ModuleLoader__`), and
`lib/index.js` is the host half; there is no compile step.
