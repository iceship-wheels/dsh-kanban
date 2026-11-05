/**
 * Smoke tests for dsh-plugin-kanban.
 *
 * Runs the real browser bundle in a VM with a fake module loader and the real
 * React, renders every component, and exercises the host HTTP route against a
 * real Node server and a throwaway DSH_HOME.
 *
 * Run: node test/smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')

/** Resolve the test-only React install: the repo's own devDependencies, else the scratch copy. */
function loadTestDependencies() {
  const candidates = [root, path.join(root, '.tmp', 'tb')]
  const errors = []
  for (const base of candidates) {
    try {
      const requireFrom = createRequire(path.join(base, 'package.json'))
      return { React: requireFrom('react'), ReactDOMServer: requireFrom('react-dom/server') }
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
    }
  }
  throw new Error(
    'React is required for the component tests. Run `npm install --ignore-scripts` in the repo first.\n' +
      errors.join('\n'),
  )
}
const { React, ReactDOMServer } = loadTestDependencies()

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL  ${name}`)
    console.error(`      ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
}
async function checkAsync(name, fn) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL  ${name}`)
    console.error(`      ${error instanceof Error ? error.message.split('\n').slice(0, 4).join('\n      ') : String(error)}`)
  }
}

// ---------------------------------------------------------------------------
// 1. Package contract
// ---------------------------------------------------------------------------
console.log('\npackage contract')
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
check('package name is a valid npm name', () => assert.match(manifest.name, /^[a-z0-9][a-z0-9._-]*$/))
check('host entry exists', () => assert.ok(existsSync(path.join(root, manifest.main))))
check('client export exists', () => assert.ok(existsSync(path.join(root, manifest.exports['./client']))))
check('bundle patch exists', () => assert.ok(existsSync(path.join(root, manifest.dsh.bundle.patch))))
check('client platform is web', () => assert.equal(manifest.dsh.client.platform, 'web'))
check('no @deepseek-ai peerDependencies (version gate)', () => {
  const peers = Object.keys(manifest.peerDependencies ?? {})
  assert.deepEqual(peers.filter((name) => name.startsWith('@deepseek-ai/')), [])
})
const patchText = readFileSync(path.join(root, manifest.dsh.bundle.patch), 'utf8')
check('patch inserts the plugin row', () => {
  assert.match(patchText, /insert:/)
  assert.match(patchText, /id:\s*dsh-kanban/)
  assert.match(patchText, new RegExp(`name:\\s*${manifest.name}`))
})

// ---------------------------------------------------------------------------
// 2. Browser bundle under a fake module loader
// ---------------------------------------------------------------------------
console.log('\nbrowser bundle')
const source = readFileSync(path.join(root, manifest.exports['./client']), 'utf8')
let loaded = null
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URL,
  fetch: (...args) => fetch(...args),
  crypto: globalThis.crypto,
}
sandbox.window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

check('bundle registers through window.__ModuleLoader__', () => assert.ok(loaded !== null))
check('bundle id matches the package name', () => assert.equal(loaded.id, manifest.name))
const clientExports = loaded.factory((request) => {
  if (request === 'react') return React
  throw new Error(`unexpected module request: ${request}`)
})
check('client injects slots and locale services', () =>
  assert.deepEqual(Array.from(clientExports.inject), ['slots', 'locale']))
check('client exports apply and internals', () => {
  assert.equal(typeof clientExports.apply, 'function')
  assert.equal(typeof clientExports.__internals.renderMarkdown, 'function')
})

const internals = clientExports.__internals

// ---------------------------------------------------------------------------
// 3. Markdown renderer
// ---------------------------------------------------------------------------
console.log('\nmarkdown')
const markdown = [
  '# Heading',
  '',
  'Some **bold**, *italic*, ~~struck~~ and `code`.',
  '',
  '- one',
  '- two',
  '  - nested',
  '',
  '1. first',
  '2. second',
  '',
  '- [x] done task',
  '- [ ] open task',
  '',
  '```js',
  'const x = 1 < 2 && 3 > 2;',
  '```',
  '',
  '> quoted **text**',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '---',
  '',
  '[ok](https://example.com) and <script>alert(1)</script>',
  '[bad](javascript:alert(1))',
  '![img](https://example.com/x.png)',
].join('\n')
const rendered = internals.renderMarkdown(markdown)
check('headings', () => assert.match(rendered, /<h1>Heading<\/h1>/))
check('emphasis and code', () => {
  assert.match(rendered, /<strong>bold<\/strong>/)
  assert.match(rendered, /<em>italic<\/em>/)
  assert.match(rendered, /<del>struck<\/del>/)
  assert.match(rendered, /<code>code<\/code>/)
})
check('lists and interactive task checkboxes', () => {
  assert.match(rendered, /<ul>/)
  assert.match(rendered, /<ol>/)
  assert.match(rendered, /<input type="checkbox" data-task-index="0" checked>/)
  assert.match(rendered, /<input type="checkbox" data-task-index="1">/)
})
check('completed tasks are struck through', () => {
  assert.match(rendered, /<span class="dsh-kanban-task-done">done task<\/span>/)
  assert.doesNotMatch(rendered, /<span class="dsh-kanban-task-done">open task<\/span>/)
})
check('nested list items keep their indent and task order', () => {
  const html = internals.renderMarkdown('- parent\n  - [ ] child one\n  - [x] child two\n- second')
  assert.match(html, /^<ul><li>parent<ul>/)
  assert.match(html, /<input type="checkbox" data-task-index="0"> child one/)
  assert.match(html, /<input type="checkbox" data-task-index="1" checked> <span class="dsh-kanban-task-done">child two<\/span>/)
  assert.match(html, /<\/ul><\/li><li>second<\/li><\/ul>$/)
})
check('blank-line-separated list items render as one list', () => {
  assert.match(internals.renderMarkdown('- one\n\n- two\n\n- three'), /^<ul><li>one<\/li><li>two<\/li><li>three<\/li><\/ul>$/)
})
check('toggleTask addresses nested tasks in document order', () => {
  const source = '- parent\n  - [ ] child one\n  - [x] child two\n- [ ] top two'
  assert.match(internals.toggleTask(source, 1), /  - \[ \] child two/)
  assert.match(internals.toggleTask(source, 2), /- \[x\] top two/)
})
check('fenced code is escaped', () => assert.match(rendered, /<pre><code class="language-js">const x = 1 &lt; 2 &amp;&amp; 3 &gt; 2;<\/code><\/pre>/))
check('blockquote, table, hr', () => {
  assert.match(rendered, /<blockquote>/)
  assert.match(rendered, /<table>/)
  assert.match(rendered, /<hr>/)
})
check('raw HTML is escaped, not executed', () => {
  assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.ok(!rendered.includes('<script>'))
})
check('safe links only', () => {
  assert.match(rendered, /<a href="https:\/\/example.com"/)
  assert.match(rendered, /rel="noreferrer noopener"/)
  assert.ok(!rendered.includes('javascript:'))
  assert.match(rendered, /<a href="https:\/\/example.com\/x.png"/) // image degrades to a link
})
check('empty input renders empty output', () => assert.equal(internals.renderMarkdown(''), ''))
check('single newlines become hard breaks', () =>
  assert.match(internals.renderMarkdown('line one\nline two'), /<p>line one<br>line two<\/p>/))
check('inline code with mixed markup', () =>
  assert.match(internals.renderInline('`a<b>` and **c**'), /<code>a&lt;b&gt;<\/code> and <strong>c<\/strong>/))
check('backslash escapes are literal', () =>
  assert.equal(internals.renderInline('\\*not em\\*'), '*not em*'))
check('intra-word underscores stay plain', () =>
  assert.match(internals.renderInline('snake_case_name'), /^snake_case_name$/))
check('autolink trailing punctuation is trimmed', () => {
  const html = internals.renderInline('see https://example.com/a, ok')
  assert.match(html, /href="https:\/\/example.com\/a"/)
  assert.match(html, /<\/a>, ok$/)
})
check('nested emphasis inside links and strongs', () =>
  assert.match(
    internals.renderInline('[**bold** link](https://example.com)'),
    /<a href="https:\/\/example.com"[^>]*><strong>bold<\/strong> link<\/a>/,
  ))

// Robustness: pathological input must neither throw nor take quadratic time.
check('deep blockquote nesting is capped, not fatal', () => {
  const probe = `${'>'.repeat(2500)} deep`
  const html = internals.renderMarkdown(probe)
  assert.ok(html.length > 0)
  assert.ok(html.includes('deep'))
})
check('100k brackets render quickly', () => {
  const probe = '['.repeat(100_000)
  const started = performance.now()
  const html = internals.renderMarkdown(probe)
  const elapsed = performance.now() - started
  assert.ok(html.length >= probe.length)
  assert.ok(elapsed < 1500, `took ${Math.round(elapsed)}ms`)
})
check('200k inline backtick runs render quickly', () => {
  const started = performance.now()
  internals.renderMarkdown('x`'.repeat(100_000))
  const elapsed = performance.now() - started
  assert.ok(elapsed < 1500, `took ${Math.round(elapsed)}ms`)
})
check('160k link-lookalike characters render quickly', () => {
  const started = performance.now()
  internals.renderMarkdown('[a](b'.repeat(40_000))
  const elapsed = performance.now() - started
  assert.ok(elapsed < 1500, `took ${Math.round(elapsed)}ms`)
})

// Block parsing underpins folding sections and task toggling.
check('splitBlocks separates block kinds', () => {
  const blocks = internals.splitBlocks(
    '# H\n\npara\nline2\n\n- a\n- b\n\n```js\ncode\n```\n\n> q\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
  )
  assert.equal(blocks.map((block) => block.type).join(','), 'heading,paragraph,list,code,quote,table')
})
check('splitBlocks keeps raw block sources', () => {
  const blocks = internals.splitBlocks('## Title\n\n- [x] done')
  assert.equal(blocks[0].source, '## Title')
  assert.equal(blocks[1].source, '- [x] done')
})
check('splitBlocks and renderMarkdown agree', () => {
  const source = '> quote\n\n1. one\n2. two\n\ncode `x` and **b**'
  const direct = internals.renderMarkdown(source)
  const viaBlocks = internals.splitBlocks(source).map((block) => internals.renderMarkdown(block.source)).join('\n')
  assert.equal(direct, viaBlocks)
})
check('fenced code survives block editing', () => {
  const blocks = internals.splitBlocks('```js\nconst a = 1;\n```')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'code')
  assert.match(internals.renderMarkdown(blocks[0].source), /language-js/)
})

// Task toggling and folding sections.
check('toggleTask flips only the addressed task line', () => {
  const source = '- [ ] first\n- [x] second\n1. [ ] third'
  const toggled = internals.toggleTask(source, 2)
  assert.match(toggled, /- \[ \] first/)
  assert.match(toggled, /- \[x\] second/)
  assert.match(toggled, /1\. \[x\] third/)
  const again = internals.toggleTask(toggled, 2)
  assert.match(again, /1\. \[ \] third/)
})
check('toggleTask leaves task text inside fenced code alone', () => {
  const source = '```\n- [ ] not a task\n```\n\n- [ ] real task'
  const toggled = internals.toggleTask(source, 0)
  assert.match(toggled, /- \[ \] not a task/)
  assert.match(toggled, /- \[x\] real task/)
})
check('toggleTask tolerates an out-of-range index', () => {
  const source = '- [ ] only'
  assert.equal(internals.toggleTask(source, 5), source)
})
check('buildSections groups blocks under h1–h3 foldable headings', () => {
  const sections = internals.buildSections('# One\n\npara\n\n### Three\n\ntext\n\n#### Four\n\nx')
  assert.equal(sections.length, 4) // leading empty section + h1 + h3 + h4
  assert.equal(sections[0].heading, null)
  assert.equal(sections[1].heading.level, 1)
  assert.equal(sections[1].heading.foldable, true)
  assert.match(sections[1].html, /<p>para<\/p>/)
  assert.equal(sections[2].heading.level, 3)
  assert.equal(sections[2].heading.foldable, true)
  assert.equal(sections[3].heading.level, 4)
  assert.equal(sections[3].heading.foldable, false)
})

// Layout solver: choose a group's column count from its measured height.
check('fitColumns grows columns to fit the height', () => {
  assert.equal(internals.fitColumns(1, 1200, 800, 2), 2)
})
check('fitColumns only shrinks when the wider layout is comfortable', () => {
  assert.equal(internals.fitColumns(2, 700, 800, 2), 2) // one column would overflow
  assert.equal(internals.fitColumns(2, 400, 800, 2), 2) // exactly at the limit: keep hysteresis
  assert.equal(internals.fitColumns(2, 300, 800, 2), 1) // clearly fits one column
})
check('fitColumns respects the group column cap', () => {
  assert.equal(internals.fitColumns(2, 5000, 300, 2), 2)
  assert.equal(internals.fitColumns(1, 10, 800, 1), 1)
})
check('allocateColumns shares a limited column budget proportionally', () => {
  assert.equal(JSON.stringify(internals.allocateColumns({ work: 4, learn: 2, others: 1 }, 4)), JSON.stringify({ work: 2, learn: 1, others: 1 }))
  assert.equal(JSON.stringify(internals.allocateColumns({ work: 4, learn: 1, others: 1 }, 4)), JSON.stringify({ work: 2, learn: 1, others: 1 }))
  assert.equal(JSON.stringify(internals.allocateColumns({ work: 2, learn: 1 }, 6)), JSON.stringify({ work: 2, learn: 1 }))
})
check('allocateColumns never drops a group below one column', () => {
  assert.equal(JSON.stringify(internals.allocateColumns({ a: 1, b: 1 }, 1)), JSON.stringify({ a: 1, b: 1 }))
})
check('groups carry no designed column counts', () => {
  assert.equal('maxColumns' in internals.DEFAULT_GROUPS[0], false)
})

// ---------------------------------------------------------------------------
// 4. Components render
// ---------------------------------------------------------------------------
console.log('\ncomponents')
const t = (key) => key
const project = {
  id: 'p1',
  title: 'Demo project',
  notes: '## Notes\n\n- shipped **markdown**',
  status: 'active',
  group: 'work',
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T01:00:00.000Z',
}
const cardHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.ProjectCard, {
    project,
    t,
    onEdit: () => {},
    onToggleTask: () => {},
    onDelete: () => {},
    onCycleStatus: () => {},
  }),
)
check('card renders title, status, markdown, meta and no stale markdown label', () => {
  assert.match(cardHtml, /dsh-kanban-card/)
  assert.match(cardHtml, /Demo project/)
  assert.match(cardHtml, /is-active/)
  assert.match(cardHtml, /<h2 class="dsh-kanban-sec-title">Notes<\/h2>/)
  assert.match(cardHtml, /<strong>markdown<\/strong>/)
  assert.match(cardHtml, /updated/)
  assert.match(cardHtml, /dsh-kanban-card-headline/)
  assert.match(cardHtml, /class="dsh-kanban-card-headline">.*?class="dsh-kanban-card-title"/)
  assert.doesNotMatch(cardHtml, /markdownHint/)
})
const editorHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.ProjectEditor, {
    initial: { title: 'Draft', notes: '# Notes\n\n- [ ] item', status: 'idea', group: 'work' },
    groups: internals.DEFAULT_GROUPS,
    t,
    onSave: () => {},
    onCancel: () => {},
  }),
)
check('editor is the textarea + Write/Preview form with title, status and group', () => {
  assert.match(editorHtml, /dsh-kanban-title-input/)
  assert.match(editorHtml, /<select/)
  assert.match(editorHtml, /role="tablist"/)
  assert.match(editorHtml, /aria-selected="true"[^>]*>write</)
  assert.match(editorHtml, /dsh-kanban-textarea/)
  assert.match(editorHtml, /># Notes/)
  assert.doesNotMatch(editorHtml, /dsh-kanban-block-input|role="toolbar"|dsh-kanban-edit-title/)
})
const sizedEditorHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.ProjectEditor, {
    initial: { title: 'Draft', notes: '# Notes\n\n- item', status: 'idea', group: 'work' },
    groups: internals.DEFAULT_GROUPS,
    t,
    preserveHeight: 264,
    onSave: () => {},
    onCancel: () => {},
  }),
)
check('editing keeps the tile height', () => {
  assert.match(sizedEditorHtml, /class="dsh-kanban-editor is-sized"/)
  assert.match(sizedEditorHtml, /style="height:264px"/)
  assert.doesNotMatch(editorHtml, /height:/)
})
const mdViewHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.MarkdownView, {
    text: '# One\n\nbody\n\n## Two\n\n- [ ] task',
    projectKey: 'p1',
    onToggleTask: () => {},
  }),
)
check('markdown view folds h1–h3 with a triangle toggle and keeps checkboxes interactive', () => {
  assert.match(mdViewHtml, /dsh-kanban-section/)
  assert.match(mdViewHtml, /data-fold-index="0"/)
  assert.match(mdViewHtml, /dsh-kanban-fold-toggle/)
  assert.match(mdViewHtml, /<path d="M4.5 2.4 L13.2 8 L4.5 13.6 Z"><\/path>/)
  assert.match(mdViewHtml, /transform:rotate\(90deg\)/)
  assert.match(mdViewHtml, /<h1 class="dsh-kanban-sec-title">One<\/h1>/)
  assert.match(mdViewHtml, /<input type="checkbox" data-task-index="0">/)
  assert.doesNotMatch(mdViewHtml, /disabled/)
})
const h4Html = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.MarkdownView, { text: '#### Four\n\nbody', projectKey: 'p2' }),
)
check('h4+ headings are not foldable', () => assert.doesNotMatch(h4Html, /data-fold-index/))
const groupHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.GroupSection, {
    group: internals.DEFAULT_GROUPS[0],
    projects: [project],
    mode: 'fit',
    columns: 2,
    overflow: false,
    leading: null,
    t,
    measure: () => {},
    renderProject: (item) => React.createElement(internals.ProjectCard, { key: item.id, project: item, t, onEdit: () => {}, onToggleTask: () => {}, onDelete: () => {}, onCycleStatus: () => {} }),
    onNewProject: () => {},
  }),
)
check('group section renders its header, count and content columns', () => {
  assert.match(groupHtml, /data-group="work"/)
  assert.match(groupHtml, /dsh-kanban-group-title/)
  assert.match(groupHtml, /Demo project/)
  assert.match(groupHtml, /column-count:2/)
})
const popoverHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.GroupsPopover, { groups: internals.DEFAULT_GROUPS, t, onChange: () => {}, onClose: () => {} }),
)
check('groups popover edits titles and explains the automatic columns', () => {
  assert.match(popoverHtml, /role="dialog"/)
  assert.match(popoverHtml, /<input/)
  assert.match(popoverHtml, /groupColumnsAuto/)
  assert.match(popoverHtml, /addGroup/)
  assert.doesNotMatch(popoverHtml, /<select/)
})
const fakeCtx = {
  locale: { subscribe: () => () => {} },
}
const pageHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.KanbanPage, { clientCtx: fakeCtx, t }),
)
check('page renders header, filters, groups button and loading state', () => {
  assert.match(pageHtml, /dsh-kanban-root/)
  assert.match(pageHtml, /newProject/)
  assert.match(pageHtml, /groups/)
  assert.match(pageHtml, /dsh-kanban-filters/)
  assert.match(pageHtml, /dsh-kanban-loading/)
  assert.doesNotMatch(pageHtml, /dsh-kanban-subtitle/)
})
check('normalizeBoard fills the starter groups for an old board', () => {
  const board = internals.normalizeBoard({ version: 1, projects: [{ id: 'a', title: 'A', notes: 'n', status: 'done' }] })
  assert.equal(board.version, 2)
  assert.equal(board.groups.map((group) => group.id).join(','), 'work,learn,others')
  assert.equal(board.projects[0].group, 'others')
  assert.equal(board.projects[0].status, 'done')
})
check('normalizeBoard validates groups, ids and fallback assignment', () => {
  const board = internals.normalizeBoard({
    groups: [
      { id: 'a', title: 'A', maxColumns: 9 },
      { id: 'a', title: 'duplicate' },
      { id: 'bad id!', title: 'B', maxColumns: 2 },
    ],
    projects: [
      { id: 'p1', title: 'one', group: 'missing' },
      { id: 'bad id!', title: 'two', group: 'a' },
      null,
    ],
  })
  assert.equal(board.groups.length, 2)
  assert.equal('maxColumns' in board.groups[0], false)
  assert.equal(board.projects.length, 2)
  assert.equal(board.projects[0].group, 'a')
  assert.match(board.projects[1].id, /^[A-Za-z0-9_-]{1,64}$/)
})
check('resolveLoadedBoard prefers a newer mirror only when it must', () => {
  const v1Payload = { board: { version: 1, projects: [{ id: 'a', title: 'A' }] }, savedAt: '2026-01-01T00:00:00.000Z' }
  const v2Payload = { board: { version: 2, groups: internals.DEFAULT_GROUPS, projects: [{ id: 'a', group: 'work' }] }, savedAt: '2026-01-02T00:00:00.000Z' }
  const mirrorNew = {
    board: internals.normalizeBoard({ version: 2, groups: internals.DEFAULT_GROUPS, projects: [{ id: 'a', group: 'work' }] }),
    savedAt: Date.parse('2026-01-03T00:00:00.000Z'),
  }
  const mirrorOld = {
    board: internals.normalizeBoard({ version: 1, projects: [{ id: 'a' }] }),
    savedAt: Date.parse('2025-12-31T00:00:00.000Z'),
  }
  // An outdated host: the banner shows, and a mirror (if any) wins.
  assert.equal(internals.resolveLoadedBoard(v1Payload, null).hostOutdated, true)
  assert.equal(internals.resolveLoadedBoard(v1Payload, mirrorNew).board.projects[0].group, 'work')
  // A current host: a stale mirror is ignored, a newer one is migrated.
  assert.equal(internals.resolveLoadedBoard(v2Payload, mirrorOld).migrateMirror, false)
  assert.equal(internals.resolveLoadedBoard(v2Payload, mirrorOld).board.projects[0].group, 'work')
  const migration = internals.resolveLoadedBoard(v2Payload, mirrorNew)
  assert.equal(migration.migrateMirror, true)
  assert.equal(migration.hostOutdated, false)
  assert.equal(migration.board.projects[0].group, 'work')
})

// ---------------------------------------------------------------------------
// 5. apply() wiring into the client tree
// ---------------------------------------------------------------------------
console.log('\nclient wiring')
const registrations = []
const injections = []
const fakeClientCtx = {
  effect: (factory) => {
    const disposer = factory()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  locale: {
    bind: () => (key) => key,
    register: () => () => {},
    subscribe: () => () => {},
    getSnapshot: () => ({ active: 'en', revision: 1 }),
  },
  slots: {
    inject: (slot, callback) => {
      injections.push(slot)
      const result = callback()
      return typeof result === 'function' ? result : () => {}
    },
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  },
}
clientExports.apply(fakeClientCtx)
check('waits for the sidebar panellist and main slots', () =>
  assert.deepEqual(injections.sort(), ['main', 'sidebar.panellist']))
check('registers one sidebar entry with the kanban id', () => {
  const entry = registrations.find((item) => item.options.name === 'sidebar.panellist')
  assert.ok(entry)
  assert.equal(entry.options.id, internals.PANEL_ID)
  assert.equal(entry.options.locale, internals.NS)
  assert.equal(entry.options.label(), 'panel')
  assert.equal(typeof entry.component, 'function')
})
check('registers one keyed main page', () => {
  const entry = registrations.find((item) => item.options.name === 'main')
  assert.ok(entry)
  assert.equal(entry.options.key, internals.PANEL_ID)
  const element = entry.component({})
  assert.equal(element.type, internals.KanbanPage)
})
check('panel glyph renders at a requested size', () => {
  const entry = registrations.find((item) => item.options.name === 'sidebar.panellist')
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(entry.component, { size: 18, active: true }))
  assert.match(html, /<svg[^>]*width="18"/)
})

// ---------------------------------------------------------------------------
// 6. Host route, real HTTP and real board file
// ---------------------------------------------------------------------------
console.log('\nhost route')
const home = path.join(root, '.tmp', 'test-home')
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home
const host = await import(pathToFileURL(path.join(root, manifest.main)).href)
let port = 0
const hostCtx = {
  effect: (factory) => {
    const disposer = factory()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  webServer: {
    register: (route) => {
      assert.equal(route.kind, 'prefix')
      assert.equal(route.path, '/dsh-kanban/api')
      server = http.createServer(route.handler)
      return () => {}
    },
    getOrigin: () => `http://127.0.0.1:${port}`,
  },
}
let server = null
host.apply(hostCtx)
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
port = server.address().port
const base = `http://127.0.0.1:${port}`
const jsonPost = (url, body, headers = {}) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

await checkAsync('health answers', async () => {
  const response = await fetch(base + '/dsh-kanban/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, route: '/dsh-kanban/api' })
})
await checkAsync('empty board reads as an empty board', async () => {
  const response = await fetch(base + '/dsh-kanban/api/board')
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.savedAt, null)
  assert.equal(payload.board.version, 2)
  assert.equal(payload.board.groups.length, 3)
  assert.deepEqual(payload.board.projects, [])
})
await checkAsync('posting the board normalizes and persists it', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', {
    version: 1,
    projects: [
      { id: 'ok-1', title: 'Alpha', notes: '# hi', status: 'done', createdAt: '2026-01-01T00:00:00.000Z' },
      { title: 'Missing id', notes: 'note', status: 'not-a-status' },
    ],
  })
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.board.projects.length, 2)
  assert.equal(payload.board.projects[1].status, 'idea')
  assert.match(payload.board.projects[1].id, /^[0-9a-f-]{36}$/)
  const file = path.join(home, 'kanban', 'board.json')
  assert.ok(existsSync(file))
  const stored = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(stored.projects[0].title, 'Alpha')
})
await checkAsync('a later read returns the persisted board', async () => {
  const payload = await (await fetch(base + '/dsh-kanban/api/board')).json()
  assert.equal(payload.board.projects.length, 2)
  assert.equal(payload.board.projects[0].title, 'Alpha')
})
await checkAsync('groups persist and are validated on write', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', {
    version: 2,
    groups: [
      { id: 'work', title: 'Work', maxColumns: 2 },
      { id: 'learn', title: 'Learn', maxColumns: 9 },
      { id: 'work', title: 'duplicate' },
      { id: 'bad id!', title: 'Bad', maxColumns: 2 },
    ],
    projects: [
      { id: 'g1', title: 'Grouped', group: 'learn' },
      { id: 'g2', title: 'Unknown group', group: 'missing' },
    ],
  })
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.board.version, 2)
  assert.equal(payload.board.groups.length, 3)
  assert.equal('maxColumns' in payload.board.groups[1], false)
  assert.equal(payload.board.groups[0].id, 'work')
  assert.equal(payload.board.groups[1].id, 'learn')
  assert.match(payload.board.groups[2].id, /^g_[A-Za-z0-9-]+$/)
  assert.equal(payload.board.projects[0].group, 'learn')
  assert.equal(payload.board.projects[1].group, 'work')
  const stored = JSON.parse(readFileSync(path.join(home, 'kanban', 'board.json'), 'utf8'))
  assert.equal(stored.version, 2)
  assert.equal(stored.projects[0].group, 'learn')
  assert.equal(stored.groups[0].id, 'work')
})
await checkAsync('a version-1 board migrates on write', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', { version: 1, projects: [{ id: 'v1-project', title: 'V1 project', status: 'active' }] })
  const payload = await response.json()
  assert.equal(payload.board.version, 2)
  assert.equal(payload.board.groups.length, 3)
  assert.equal(payload.board.projects[0].group, 'others')
})
await checkAsync('GET reports the stored timestamp used for mirror resolution', async () => {
  const first = await (await fetch(base + '/dsh-kanban/api/board')).json()
  assert.equal(typeof first.savedAt, 'string')
  await jsonPost('/dsh-kanban/api/board', { projects: [{ id: 'ts', title: 'TS' }] })
  const second = await (await fetch(base + '/dsh-kanban/api/board')).json()
  assert.equal(typeof second.savedAt, 'string')
  assert.ok(Date.parse(second.savedAt) >= Date.parse(first.savedAt))
})
await checkAsync('invalid JSON is a 400', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', '{ not json')
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'invalid-json')
})
await checkAsync('a foreign Origin is forbidden', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', { projects: [] }, { origin: 'https://evil.example' })
  assert.equal(response.status, 403)
})
await checkAsync('the served Origin is allowed', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', { projects: [] }, { origin: `http://127.0.0.1:${port}` })
  assert.equal(response.status, 200)
})
await checkAsync('a loopback alias of the same port is allowed', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', { projects: [] }, { origin: `http://localhost:${port}` })
  assert.equal(response.status, 200)
})
await checkAsync('a loopback origin on another port is forbidden', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', { projects: [] }, { origin: `http://localhost:${port + 1}` })
  assert.equal(response.status, 403)
})
await checkAsync('a JSON null body is rejected instead of wiping the board', async () => {
  const response = await jsonPost('/dsh-kanban/api/board', 'null')
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'invalid-board')
  assert.equal((await (await fetch(base + '/dsh-kanban/api/board')).json()).ok, true)
})
await checkAsync('unknown paths are 404 and unknown methods are 405', async () => {
  assert.equal((await fetch(base + '/dsh-kanban/api/nope')).status, 404)
  const response = await fetch(base + '/dsh-kanban/api/board', { method: 'DELETE' })
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET, HEAD, POST, PUT')
})
await checkAsync('a corrupt board file is backed up and recovered', async () => {
  const file = path.join(home, 'kanban', 'board.json')
  writeFileSync(file, '{ oops', 'utf8')
  const payload = await (await fetch(base + '/dsh-kanban/api/board')).json()
  assert.equal(payload.ok, true)
  assert.equal(payload.recovered, true)
  assert.deepEqual(payload.board.projects, [])
})
await checkAsync('oversized bodies are consistently rejected with 413', async () => {
  const big = JSON.stringify({ notes: 'x'.repeat(5 * 1024 * 1024) })
  for (let round = 0; round < 4; round += 1) {
    const response = await jsonPost('/dsh-kanban/api/board', big)
    assert.equal(response.status, 413, `round ${round} returned ${response.status}`)
  }
  // A rejected oversized request must not poison the route for later requests.
  assert.equal((await fetch(base + '/dsh-kanban/api/health')).status, 200)
})

const closed = new Promise((resolve) => server.close(resolve))
server.closeAllConnections()
await closed
rmSync(home, { recursive: true, force: true })

// ---------------------------------------------------------------------------
console.log('')
if (failures > 0) {
  console.error(`${failures} test(s) failed`)
  process.exit(1)
}
console.log('all tests passed')
