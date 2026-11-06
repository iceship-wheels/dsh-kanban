/**
 * Build a static page with the real project editor dialog and the real bundled
 * CSS, so the editing typography can be eyeballed in a browser.
 *
 * Run: node test/editor-harness.mjs
 * Output: .tmp/editor.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(path.join(root, 'package.json'))
const React = require('react')
const ReactDOMServer = require('react-dom/server')

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

const notes = [
  '> Co-authors: @IceShip423 @stellaxcpeng',
  '',
  '<!-- pr-states:start -->',
  '## CI states',
  '',
  'Latest PR Test (Base): **Missing run-ci label** -- add it to run CI tests.',
  'Latest PR Test (Extra): **Blocked** -- `run-ci` is required first.',
  '',
  '- [x] Base CI covers the core cases',
  '- [ ] Extra CI exercises the change',
  '  - nested follow-up',
  '',
  '```js',
  'const answer = runTests({ retries: 2 })',
  '```',
  '<!-- pr-states:end -->',
].join('\n')

const initial = {
  id: 'demo',
  title: 'Document the CI states for the change',
  notes,
  status: 'active',
  group: 'work',
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-06T01:00:00.000Z',
}

const html = ReactDOMServer.renderToStaticMarkup(
  React.createElement(internals.ProjectEditor, {
    initial,
    groups: internals.DEFAULT_GROUPS,
    t,
    label: 'Edit',
    onSave: () => {},
    onCancel: () => {},
  }),
)

mkdirSync(path.join(root, '.tmp'), { recursive: true })
writeFileSync(
  path.join(root, '.tmp', 'editor.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>editor</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #f6f6f8; }
  ${CSS}
</style></head>
<body>${html}</body></html>`,
)
console.log('wrote .tmp/editor.html')
