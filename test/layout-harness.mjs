/**
 * Build static layout-harness pages for the grouped kanban board: the real
 * bundled CSS + real React rendering of GroupSection, so the column widths and
 * multi-column flow can be verified in a headless browser.
 *
 * Run: node test/layout-harness.mjs
 * Output: .tmp/harness-short.html, .tmp/harness-tall.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')
const requireFrom = createRequire(path.join(root, 'package.json'))
const React = requireFrom('react')
const ReactDOMServer = requireFrom('react-dom/server')

const source = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
let loaded = null
const sandbox = { console, setTimeout, clearTimeout, URL, fetch, crypto: globalThis.crypto }
sandbox.window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })
const internals = loaded.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected module request: ${id}`)
}).__internals

const cssMatch = /const CSS = `([\s\S]*?)`;\n\n\t\tfunction injectStyles/.exec(source)
if (cssMatch === null) throw new Error('CSS block not found')
const CSS = cssMatch[1]
const t = (key) => key

function project(id, title, notes, status, group) {
  return {
    id,
    title,
    notes,
    status,
    group,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T01:00:00.000Z',
  }
}

const projects = [
  project('a', 'Layout demo A', '', 'idea', 'work'),
  project('b', 'Layout demo B', '', 'idea', 'work'),
  project('c', 'Layout demo C', '', 'idea', 'work'),
  project('d', 'Layout demo D', '', 'idea', 'work'),
  project('welcome', 'Welcome to your board', '# Kanban for projects\n\n- one\n- two\n\n- [x] done\n- [ ] open', 'done', 'learn'),
  project('wrap', 'A deliberately long project title that wraps across two lines', 'A long title wraps here to show the status badge sitting inside the title block.', 'active', 'learn'),
  project('ship', 'Ship the sidebar entry', 'Bundle, host route, sidebar entry and HMR reload are verified.', 'done', 'others'),
]

function groupHtml(group, groupProjects, columns) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(internals.GroupSection, {
      group,
      projects: groupProjects,
      mode: 'fit',
      columns,
      overflow: false,
      leading: null,
      t,
      measure: () => {},
      renderProject: (item) =>
        React.createElement(internals.ProjectCard, {
          key: item.id,
          project: item,
          t,
          onEdit: () => {},
          onToggleTask: () => {},
          onDelete: () => {},
          onCycleStatus: () => {},
        }),
      onNewProject: () => {},
      key: group.id,
    }),
  )
}

function page({ height, workColumns, label }) {
  const groups = internals.DEFAULT_GROUPS
  const columns = [workColumns, 1, 1]
  const html = [
    groupHtml(groups[0], projects.filter((p) => p.group === 'work'), columns[0]),
    groupHtml(groups[1], projects.filter((p) => p.group === 'learn'), columns[1]),
    groupHtml(groups[2], projects.filter((p) => p.group === 'others'), columns[2]),
  ].join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${label}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #f6f6f8; }
  ${CSS}
</style></head>
<body>
<div class="dsh-kanban-root" style="height:100%;width:1420px;box-sizing:border-box">
  <div class="dsh-kanban-scroll" style="height:${height}px">
    <div class="dsh-kanban-groups-row" style="display:grid;grid-template-columns:${columns.map((count) => String(count) + 'fr').join(' ')};gap:16px;align-items:start">
      ${html}
    </div>
  </div>
</div>
</body></html>`
}

mkdirSync(path.join(root, '.tmp'), { recursive: true })
writeFileSync(path.join(root, '.tmp', 'harness-short.html'), page({ height: 560, workColumns: 2, label: 'short' }))
writeFileSync(path.join(root, '.tmp', 'harness-tall.html'), page({ height: 980, workColumns: 1, label: 'tall' }))
console.log('wrote harness-short.html (work=2 auto columns, 560px) and harness-tall.html (work=1 auto column, 980px)')
