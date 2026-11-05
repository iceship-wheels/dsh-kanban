/**
 * Import a Feishu-style TODO.md into a kanban board (v2 JSON, ready to POST to
 * /dsh-kanban/api/board). The file is expected to have the user's sections:
 *
 *   "# 任务清单"  with "## 开发" / "## 学习" numbered lists
 *   "# 正在做"    with "## section" checklists
 *   "# 已完成"    with "## section" checklists
 *
 * Classification:
 *  - "# 任务清单 / 开发" numbered items        -> group work,  status idea
 *  - "# 任务清单 / 学习" numbered items        -> group learn, status idea
 *  - "# 正在做 / ## section"                   -> group work (admin/others exceptions),
 *                                                 status active if it has open boxes,
 *                                                 idea when empty, done if all boxes checked
 *  - "# 已完成 / ## section"                   -> status done, group by topic keyword
 *
 * Usage: node tools/import-todo.mjs [path/to/TODO.md] [out.json]
 *        curl -X POST -H "Content-Type: application/json" \
 *             --data-binary @.tmp/import-board.json http://127.0.0.1:<port>/dsh-kanban/api/board
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const TODO_PATH = process.argv[2] ?? path.join(ROOT, 'TODO.md')
const OUT = process.argv[3] ?? path.join(ROOT, '.tmp', 'import-board.json')

const raw = readFileSync(TODO_PATH, 'utf8').replace(/\r\n?/g, '\n')
const unescape = (text) => text.replace(/\\([\\`*_{}\[\]()#+\-.!~>|])/g, '$1')
const now = new Date().toISOString()

const lines = raw.split('\n').map((line) => unescape(line.replace(/\s+$/, '')))

/** Split into "# title" top sections, each holding "## title" subsections with bodies. */
function parse(textLines) {
  const sections = []
  let top = null
  let sub = null
  for (const line of textLines) {
    if (/^#\s+/.test(line)) {
      top = { title: line.replace(/^#\s+/, '').trim(), subs: [] }
      sub = null
      sections.push(top)
      continue
    }
    if (/^##\s*/.test(line)) {
      const title = line.replace(/^##\s*/, '').trim()
      sub = { title, body: [] }
      if (top !== null) top.subs.push(sub)
      continue
    }
    if (sub !== null) sub.body.push(line)
    else if (top !== null && !top.subs.length) top.body = (top.body ?? []).concat([line])
  }
  return sections
}

const sections = parse(lines)
const section = (title) => sections.find((item) => item.title === title)
const tiles = []
let counter = 0
const nextId = () => `todo-${++counter}`
const shorten = (text, max = 60) => (text.length <= max ? text : text.slice(0, max - 1) + '…')

function addTile({ title, notes, group, status }) {
  tiles.push({
    id: nextId(),
    title: shorten(title, 60),
    notes: notes.trim(),
    status,
    group,
    createdAt: now,
    updatedAt: now,
  })
}

function numberedItems(bodyLines) {
  const items = []
  let current = null
  for (const line of bodyLines) {
    if (/^\d+[.)]\s+/.test(line)) {
      if (current !== null) items.push(current)
      current = [line.replace(/^\d+[.)]\s+/, '').trim()]
    } else if (current !== null && line.trim().length > 0) {
      current.push(line.trim())
    }
  }
  if (current !== null) items.push(current)
  return items.map((itemLines) => itemLines.join('\n'))
}

function classifyBody(body) {
  const hasOpen = body.some((line) => /^\s*([-*+]|\d+[.)])\s+\[ \]/.test(line))
  const hasChecked = body.some((line) => /^\s*([-*+]|\d+[.)])\s+\[[xX]\]/.test(line))
  if (hasOpen) return 'active'
  if (hasChecked) return 'done'
  return 'idea'
}

// --- "# 任务清单": 开发 + 学习 numbered items -------------------------------
const manifest = section('任务清单')
if (manifest !== undefined) {
  for (const sub of manifest.subs) {
    const group = sub.title.includes('学习') ? 'learn' : 'work'
    for (const item of numberedItems(sub.body)) {
      addTile({
        title: item.split('\n')[0],
        notes: item,
        group,
        status: 'idea',
      })
    }
  }
}

// --- "# 正在做": one tile per ## section -----------------------------------
const doing = section('正在做')
if (doing !== undefined) {
  for (const sub of doing.subs) {
    if (sub.title.length === 0) continue
    const body = sub.body.join('\n')
    const notes = body.trim()
    const group = sub.title.includes('certification') || sub.title.includes('持证') ? 'others' : 'work'
    addTile({ title: sub.title, notes, group, status: classifyBody(sub.body) })
  }
}

// --- "# 已完成": done tiles, grouped by topic ------------------------------
const finished = section('已完成')
if (finished !== undefined) {
  for (const sub of finished.subs) {
    if (sub.title.length === 0) continue
    const notes = sub.body.join('\n').trim()
    const group = sub.title.includes('知识图谱') ? 'others' : sub.title.includes('memfabric') ? 'learn' : 'work'
    addTile({ title: sub.title, notes, group, status: 'done' })
  }
}

const groups = [
  { id: 'work', title: 'Work' },
  { id: 'learn', title: 'Learn' },
  { id: 'others', title: 'Others' },
]

const board = { version: 2, groups, projects: tiles }
mkdirSync(path.join(ROOT, '.tmp'), { recursive: true })
writeFileSync(OUT, JSON.stringify(board, null, 2) + '\n', 'utf8')

const counts = groups.map((group) => `${group.id}=${tiles.filter((tile) => tile.group === group.id).length}`).join(' ')
const statuses = ['idea', 'active', 'paused', 'done']
  .map((status) => `${status}=${tiles.filter((tile) => tile.status === status).length}`)
  .join(' ')
console.log(`wrote ${tiles.length} tiles to ${OUT}`)
console.log('groups:', counts)
console.log('status:', statuses)
for (const tile of tiles) console.log(`  [${tile.group}/${tile.status}] ${tile.title}`)
