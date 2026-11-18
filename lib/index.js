/**
 * dsh-plugin-kanban — host half.
 *
 * Owns the durable board file and serves it to the browser half over one
 * loopback HTTP route registered with the Host web server. The route is the
 * only host/client channel this plugin needs, so the package ships no
 * dependencies and no generated Remote namespaces.
 *
 * Storage: `$DSH_HOME/kanban/board.json` (or `~/.dsh/kanban/board.json`),
 * written atomically and serialized so two windows cannot interleave writes.
 *
 * Daily tidy-up: once per local day the host clears `done` projects that have
 * not been edited for `DONE_RETENTION_DAYS` days and appends them to a markdown
 * record for the current ISO week under `$DSH_HOME/kanban/archive/`. The run
 * timestamp and the archived ids live in `$DSH_HOME/kanban/automation.json`;
 * the ids act as tombstones so a browser still holding the old board cannot
 * write the cleared projects back.
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createWeeklyHandler } from './weekly.js'

export const name = 'dsh-plugin-kanban'
export const inject = ['webServer']

/** HTTP prefix owned by this plugin. Nothing else in DSH uses it. */
const API_PREFIX = '/dsh-kanban/api'
const BOARD_ROUTE = `${API_PREFIX}/board`
const WEEKLY_ROUTE = `${API_PREFIX}/weekly`
const HEALTH_ROUTE = `${API_PREFIX}/health`

const BOARD_VERSION = 2
const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_PROJECTS = 500
const MAX_TITLE = 200
const MAX_NOTES = 200_000
const STATUSES = new Set(['idea', 'active', 'paused', 'done'])
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const MAX_GROUPS = 8
const MAX_GROUP_TITLE = 40
/** Days a `done` project may sit unedited before the daily tidy-up archives it. */
export const DONE_RETENTION_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000
/** How often the host checks whether a new local day has started. */
const TIDY_INTERVAL_MS = 30 * 60 * 1000
const AUTOMATION_STATE_VERSION = 1
/** Archived ids are kept as tombstones for a while, then forgotten. */
const TOMBSTONE_RETENTION_DAYS = 90
const MAX_TOMBSTONES = 1000
/** Prefix of the per-project comment that marks an archive entry. */
const ARCHIVE_MARKER_PREFIX = '<!-- dsh-kanban:project id='
const DEFAULT_GROUPS = [
  { id: 'work', title: 'Work' },
  { id: 'learn', title: 'Learn' },
  { id: 'others', title: 'Others' },
]

/**
 * Resolve the plugin's data directory the same way the harness resolves its
 * home: `$DSH_HOME` first, then `~/.dsh`.
 * @returns {string} absolute path of the plugin's `kanban` directory.
 */
function kanbanDir() {
  const home = process.env.DSH_HOME?.trim()
  return join(home && home.length > 0 ? home : join(homedir(), '.dsh'), 'kanban')
}

/** @returns {string} absolute path of the board JSON file. */
function boardPath() {
  return join(kanbanDir(), 'board.json')
}

/** @returns {string} absolute path of the weekly-record directory. */
function archiveDir(boardFile) {
  return join(dirname(boardFile), 'archive')
}

/** @returns {string} absolute path of the tidy-up state file. */
function automationStatePath(boardFile) {
  return join(dirname(boardFile), 'automation.json')
}

function emptyBoard() {
  return { version: BOARD_VERSION, groups: DEFAULT_GROUPS.map((group) => ({ ...group })), projects: [] }
}

/**
 * Coerce stored groups into the shape the client relies on. Missing or invalid
 * groups fall back to the default starter set; a stored `maxColumns` is ignored
 * because column counts are computed by the client layout engine.
 * @param {unknown} input
 * @returns {Array<{ id: string, title: string }>}
 */
export function normalizeGroups(input) {
  const source = Array.isArray(input) ? input.slice(0, MAX_GROUPS) : []
  const seen = new Set()
  const groups = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    let id = typeof item.id === 'string' && GROUP_ID_PATTERN.test(item.id) ? item.id : undefined
    if (id !== undefined && seen.has(id)) continue
    while (id === undefined || seen.has(id)) id = `g_${randomUUID().slice(0, 8)}`
    seen.add(id)
    const title = typeof item.title === 'string' ? item.title.slice(0, MAX_GROUP_TITLE) : ''
    groups.push({ id, title })
  }
  if (groups.length === 0) return DEFAULT_GROUPS.map((group) => ({ ...group }))
  return groups
}

/**
 * Rewrite list indentation to two spaces per nesting level, so every note keeps
 * the same cadence no matter which width it was written or imported with. The
 * levels follow the same relative-indent rule the renderer and the editor use.
 * @param {string} source
 * @returns {string}
 */
export function normalizeListIndent(source) {
  if (typeof source !== 'string' || source.length === 0) return source
  const lines = source.split('\n')
  const stack = []
  let fence = null
  let changed = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch !== null) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence !== null) continue
    const match = /^([ \t]*)([-*+]|\d+[.)])(?:[ \t]+)(.*)$/.exec(line)
    if (match === null) continue
    const indent = match[1].replace(/\t/g, '    ').length
    while (stack.length > 0 && stack[stack.length - 1] >= indent) stack.pop()
    const level = stack.length
    stack.push(indent)
    const nextIndent = '  '.repeat(level)
    if (nextIndent !== match[1]) {
      lines[index] = nextIndent + line.slice(match[1].length)
      changed = true
    }
  }
  return changed ? lines.join('\n') : source
}

/**
 * Coerce arbitrary stored input into the board shape the client relies on.
 * Unknown fields are dropped; invalid entries are skipped rather than throwing,
 * so one bad row can never make the whole board unreadable. A version-1 board
 * migrates: groups get the starter set and projects get a fallback group.
 * @param {unknown} input
 * @returns {{ version: number, groups: Array<object>, projects: Array<object> }}
 */
export function normalizeBoard(input) {
  const raw = Array.isArray(input) ? { projects: input } : input && typeof input === 'object' ? input : {}
  const groups = normalizeGroups(raw.groups)
  const groupIds = new Set(groups.map((group) => group.id))
  const fallbackGroup = groupIds.has('others') ? 'others' : groups[0].id
  const source = Array.isArray(raw.projects) ? raw.projects.slice(0, MAX_PROJECTS) : []
  const now = new Date().toISOString()
  const seen = new Set()
  const projects = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    let id = typeof item.id === 'string' && ID_PATTERN.test(item.id) ? item.id : randomUUID()
    while (seen.has(id)) id = randomUUID()
    seen.add(id)
    const status = typeof item.status === 'string' && STATUSES.has(item.status) ? item.status : 'idea'
    const group = typeof item.group === 'string' && groupIds.has(item.group) ? item.group : fallbackGroup
    const title = typeof item.title === 'string' ? item.title.slice(0, MAX_TITLE) : ''
    const notes = typeof item.notes === 'string' ? normalizeListIndent(item.notes.slice(0, MAX_NOTES)) : ''
    const createdAt = isoOr(item.createdAt, now)
    const updatedAt = isoOr(item.updatedAt, createdAt)
    projects.push({ id, title, notes, status, group, createdAt, updatedAt })
  }
  return { version: BOARD_VERSION, groups, projects }
}

function isoOr(value, fallback) {
  if (typeof value !== 'string') return fallback
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

/**
 * Read the board file, recovering from a corrupt file by moving it aside once.
 * `savedAt` is the file's modification time (null when absent), which lets a
 * client decide whether its local mirror is newer than the stored board.
 * @param {string} file
 * @returns {Promise<{ board: object, recovered: boolean, savedAt: string | null }>}
 */
async function readBoard(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { board: emptyBoard(), recovered: false, savedAt: null }
    throw error
  }
  let savedAt = null
  try {
    const info = await stat(file)
    savedAt = new Date(info.mtimeMs).toISOString()
  } catch {
    savedAt = null
  }
  try {
    return { board: normalizeBoard(JSON.parse(text)), recovered: false, savedAt }
  } catch {
    try {
      await rename(file, `${file}.corrupt-${Date.now()}.json`)
    } catch {
      // best effort: starting empty beats refusing to load forever
    }
    return { board: emptyBoard(), recovered: true, savedAt: null }
  }
}

/** Serialize writes so two browser windows cannot interleave file writes. */
let writeQueue = Promise.resolve()

/**
 * Run one read-modify-write operation after every previously queued write.
 * The queue never rejects, so one failed run cannot poison later ones.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function enqueue(task) {
  const run = writeQueue.then(task)
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * Write a file atomically (sibling temp file, then rename). The unique suffix
 * keeps two writers that share a millisecond from clobbering each other's temp.
 * @param {string} file
 * @param {string} text
 * @returns {Promise<void>}
 */
async function writeFileAtomic(file, text) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  try {
    await writeFile(temp, text, 'utf8')
    await rename(temp, file)
  } catch (error) {
    // Never leave a half-written sibling behind when the rename fails.
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * Persist a board write through the queue, dropping projects the tidy-up
 * already cleared. The tombstone check runs inside the queued task, so a save
 * that raced a sweep still cannot resurrect the archived project.
 * @param {string} file
 * @param {object} board
 * @returns {Promise<{ board: object, savedAt: string, archived: number }>}
 */
function saveBoard(file, board) {
  return enqueue(async () => {
    const state = await readAutomationState(automationStatePath(file))
    let next = board
    let archived = 0
    if (state.archived.length > 0) {
      const cleared = new Set(state.archived.map((entry) => entry.id))
      const kept = board.projects.filter((project) => !cleared.has(project.id))
      archived = board.projects.length - kept.length
      if (archived > 0) next = { ...board, projects: kept }
    }
    await writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`)
    return { board: next, savedAt: new Date().toISOString(), archived }
  })
}

/**
 * The local calendar day of a date, used to run the tidy-up at most once a day.
 * @param {Date} date
 * @returns {string} `YYYY-MM-DD` in the host's local time zone.
 */
export function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * The ISO week (Monday-based, ISO week-year) a local date belongs to. Weekly
 * records are named after this key, so the file of the week stays the same
 * across the week's days regardless of daylight-saving changes.
 * @param {Date} date
 * @returns {string} `YYYY-Www`.
 */
export function isoWeekKey(date) {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Move to the Thursday of the ISO week: it determines both week and year.
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3)
  const isoYear = thursday.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/**
 * Projects the tidy-up may clear: `done` and not edited for the retention
 * period. A missing or unparseable timestamp never qualifies, because guessing
 * could archive work the user still considers fresh.
 * @param {object} board
 * @param {Date} now
 * @param {number} [retentionDays]
 * @returns {Array<object>}
 */
export function staleDoneProjects(board, now, retentionDays = DONE_RETENTION_DAYS) {
  const projects = board && Array.isArray(board.projects) ? board.projects : []
  const cutoff = now.getTime() - retentionDays * DAY_MS
  return projects.filter((project) => {
    if (!project || project.status !== 'done') return false
    const updated = Date.parse(project.updatedAt)
    return Number.isFinite(updated) && updated <= cutoff
  })
}

/** @returns {object} a tidy-up state with no run recorded and no tombstones. */
export function emptyAutomationState() {
  return { version: AUTOMATION_STATE_VERSION, lastSweepDate: null, archived: [] }
}

/**
 * Coerce the stored tidy-up state. Invalid entries are dropped instead of
 * throwing, so a hand-edited state file cannot block the board.
 * @param {unknown} input
 * @returns {{ version: number, lastSweepDate: string | null, archived: Array<{ id: string, at: string }> }}
 */
export function normalizeAutomationState(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const seen = new Set()
  const archived = []
  for (const item of Array.isArray(raw.archived) ? raw.archived : []) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id) || seen.has(item.id)) continue
    const at = isoOr(item.at, null)
    if (at === null) continue
    seen.add(item.id)
    archived.push({ id: item.id, at })
  }
  const lastSweepDate = typeof raw.lastSweepDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastSweepDate) ? raw.lastSweepDate : null
  return { version: AUTOMATION_STATE_VERSION, lastSweepDate, archived }
}

/**
 * Read the tidy-up state, falling back to an empty state when the file is
 * missing or unreadable.
 * @param {string} file
 * @returns {Promise<object>}
 */
async function readAutomationState(file) {
  try {
    return normalizeAutomationState(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    return emptyAutomationState()
  }
}

/**
 * Forget tombstones that are old enough that no browser can still hold the
 * board they protected, and cap the list so writes stay small.
 * @param {object} state
 * @param {Date} now
 * @returns {object}
 */
function pruneTombstones(state, now) {
  const cutoff = now.getTime() - TOMBSTONE_RETENTION_DAYS * DAY_MS
  state.archived = state.archived.filter((entry) => Date.parse(entry.at) >= cutoff).slice(-MAX_TOMBSTONES)
  return state
}

/** @param {string} value @returns {string} the same text with newlines collapsed. */
function oneLine(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Render one weekly-record entry: the marker that makes the record append-only
 * (a retried sweep must not duplicate it), the title, the timestamps and the
 * full notes.
 * @param {object} project
 * @param {string} archivedAt ISO timestamp of the sweep.
 * @returns {string}
 */
export function archiveEntryMarkdown(project, archivedAt) {
  const title = oneLine(project.title).length > 0 ? oneLine(project.title) : 'Untitled project'
  const notes = typeof project.notes === 'string' ? project.notes.trimEnd() : ''
  const lines = [
    `${ARCHIVE_MARKER_PREFIX}${project.id} -->`,
    `## ${title}`,
    '',
    `- Last edited: ${project.updatedAt}`,
    `- Created: ${project.createdAt}`,
    `- Group: ${project.group}`,
    `- Archived: ${archivedAt}`,
    '',
    notes.length > 0 ? notes : '_No notes._',
  ]
  return lines.join('\n') + '\n'
}

/** @param {string} weekKey @returns {string} the header of a new weekly record. */
function archiveHeader(weekKey) {
  return [
    `# Done projects cleared — ${weekKey}`,
    '',
    `Projects that stayed \`done\` for ${DONE_RETENTION_DAYS} days without an edit are moved here by the board's daily tidy-up.`,
    'Entries are append-only and carry the last edit time, so this file is the weekly record of finished work.',
    '',
  ].join('\n')
}

/**
 * Append entries to the current week's record, skipping projects whose marker
 * is already present. The file is rewritten atomically so an interrupted sweep
 * cannot leave a truncated record.
 * @param {string} boardFile
 * @param {string} weekKey
 * @param {Array<object>} projects
 * @param {string} archivedAt
 * @returns {Promise<{ file: string, appended: number }>}
 */
async function appendArchiveEntries(boardFile, weekKey, projects, archivedAt) {
  const file = join(archiveDir(boardFile), `${weekKey}.md`)
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }
  const entries = []
  const seen = new Set()
  for (const project of projects) {
    if (seen.has(project.id)) continue
    if (text.includes(`${ARCHIVE_MARKER_PREFIX}${project.id} -->`)) continue
    seen.add(project.id)
    entries.push(archiveEntryMarkdown(project, archivedAt))
  }
  if (text.length === 0) text = archiveHeader(weekKey)
  const next = entries.length === 0 ? text : `${text}${text.endsWith('\n\n') ? '' : '\n'}${entries.join('\n---\n\n')}`
  if (next !== text) await writeFileAtomic(file, next)
  return { file, appended: entries.length }
}

/**
 * Clear stale `done` projects into the current week's markdown record and
 * persist the board without them. Runs at most once per local day unless
 * `force` is set; a day missed while the host was not running catches up on the
 * next call. The archive entry is written before the board, so a failure can
 * only leave a project on the board or a duplicate marker in the record — both
 * self-heal on the next run.
 * @param {string} boardFile
 * @param {{ now?: Date, force?: boolean }} [options]
 * @returns {Promise<{ ran: boolean, archived: number, weekKey: string, archiveFile?: string }>}
 */
export async function runDailySweep(boardFile, options = {}) {
  const now = options.now instanceof Date ? options.now : options.now === undefined ? new Date() : new Date(options.now)
  if (!Number.isFinite(now.getTime())) throw new TypeError('runDailySweep needs a valid date')
  const force = options.force === true
  const stateFile = automationStatePath(boardFile)
  const today = localDateKey(now)
  if (!force) {
    const state = await readAutomationState(stateFile)
    if (state.lastSweepDate === today) return { ran: false, archived: 0, weekKey: isoWeekKey(now) }
  }
  return enqueue(async () => {
    const state = await readAutomationState(stateFile)
    const { board } = await readBoard(boardFile)
    const stale = staleDoneProjects(board, now)
    const weekKey = isoWeekKey(now)
    let summary = { ran: true, archived: 0, weekKey: weekKey, archiveFile: join(archiveDir(boardFile), `${weekKey}.md`) }
    if (stale.length > 0) {
      const archivedAt = now.toISOString()
      // The record is written before the board so a crash can at worst leave
      // the project on the board, never lose it from both places.
      const { appended } = await appendArchiveEntries(boardFile, weekKey, stale, archivedAt)
      const removed = new Set(stale.map((project) => project.id))
      const nextBoard = { ...board, projects: board.projects.filter((project) => !removed.has(project.id)) }
      await writeFileAtomic(boardFile, `${JSON.stringify(nextBoard, null, 2)}\n`)
      // Keep a tombstone for every cleared id so an open page that still
      // holds the old board cannot write the project back.
      state.archived = state.archived.filter((entry) => !removed.has(entry.id))
      for (const id of removed) state.archived.push({ id, at: archivedAt })
      summary = { ...summary, archived: appended }
    }
    state.lastSweepDate = today
    await writeFileAtomic(stateFile, `${JSON.stringify(pruneTombstones(state, now), null, 2)}\n`)
    return summary
  })
}

/**
 * Whether the daily tidy-up should run. Set `DSH_KANBAN_AUTOMATION=off` (or
 * `0`/`false`/`disabled`) in the host environment to turn it off.
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function automationEnabled(env = process.env) {
  const value = String(env.DSH_KANBAN_AUTOMATION ?? '')
    .trim()
    .toLowerCase()
  return value !== 'off' && value !== '0' && value !== 'false' && value !== 'disabled'
}

/**
 * Read one request body as JSON under the configured byte cap. An oversized
 * body is drained and discarded rather than abandoned mid-stream: throwing out
 * of `for await (const chunk of req)` would destroy the socket, and the client
 * would see a reset instead of the 413 this handler answers with.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  let tooLarge = false
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      tooLarge = true
      chunks.length = 0
      // A peer that keeps streaming far past the cap is abusive: drop it.
      if (total > MAX_BODY_BYTES * 16) {
        req.destroy()
        break
      }
      continue
    }
    chunks.push(chunk)
  }
  if (tooLarge) {
    const error = new Error('body too large')
    error.code = 'BODY_TOO_LARGE'
    throw error
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return undefined
  return JSON.parse(text)
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

/**
 * Same-origin fence: a browser page always sends `Origin` on writes, and this
 * route is only meaningful to the page the Host itself served. The Host may be
 * reached as `127.0.0.1` or `localhost` (or an IPv6 loopback), which are the
 * same listener, so loopback spellings of the bound origin are accepted too.
 * Non-browser callers send no Origin and are allowed (loopback-only server).
 * @param {object} ctx
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
function originAllowed(ctx, req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin.length === 0) return true
  let candidate
  try {
    candidate = new URL(origin)
  } catch {
    return false
  }
  if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') return false
  const loopbackHost = candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1' || candidate.hostname === '[::1]' || candidate.hostname === '::1'
  let expected
  try {
    expected = new URL(ctx.webServer.getOrigin())
  } catch {
    // No origin to compare against: refuse rather than widen the fence.
    return false
  }
  if (candidate.origin === expected.origin) return true
  // Same port, same protocol, only a different loopback spelling: the same listener.
  return loopbackHost && candidate.port === expected.port && candidate.protocol === expected.protocol
}

function createHandler(ctx, file) {
  const weekly = createWeeklyHandler(ctx)
  return async (req, res) => {
    try {
      if (!originAllowed(ctx, req)) {
        sendJson(res, 403, { ok: false, error: 'origin-not-allowed' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === HEALTH_ROUTE) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' }, { allow: 'GET, HEAD' })
          return
        }
        sendJson(res, 200, { ok: true, route: API_PREFIX })
        return
      }
      if (url.pathname === WEEKLY_ROUTE) {
        await weekly(req, res)
        return
      }
      if (url.pathname !== BOARD_ROUTE) {
        sendJson(res, 404, { ok: false, error: 'not-found' })
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        // The tidy-up also runs on a board read, so a day is never missed just
        // because the page was opened before the interval check fired.
        if (req.method === 'GET' && automationEnabled()) {
          await runDailySweep(file).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            console.error(`[dsh-plugin-kanban] daily tidy-up failed: ${message}`)
          })
        }
        const { board, recovered, savedAt } = await readBoard(file)
        sendJson(res, 200, { ok: true, board, recovered, savedAt })
        return
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        let parsed
        try {
          parsed = await readJsonBody(req)
        } catch (error) {
          if (error && error.code === 'BODY_TOO_LARGE') {
            // The body is still streaming. Drain and discard the rest before
            // answering, so the client finishes uploading and reads the 413
            // instead of seeing a socket reset mid-upload.
            req.resume()
            sendJson(res, 413, { ok: false, error: 'body-too-large' })
            return
          }
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
          sendJson(res, 400, { ok: false, error: 'invalid-board' })
          return
        }
        const board = normalizeBoard(parsed)
        // The queued save drops projects the tidy-up already cleared; a page
        // that kept the old board in memory cannot write them back.
        const saved = await saveBoard(file, board)
        sendJson(res, 200, { ok: true, board: saved.board, savedAt: saved.savedAt, archived: saved.archived })
        return
      }
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' }, { allow: 'GET, HEAD, POST, PUT' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[dsh-plugin-kanban] board request failed: ${message}`)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal-error' })
      else res.destroy()
    }
  }
}

/**
 * Cordis plugin entry.
 * @param {object} ctx host context with the webServer service.
 */
export function apply(ctx) {
  const file = boardPath()
  const handler = createHandler(ctx, file)
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    'dsh-kanban: board api',
  )
  if (automationEnabled()) {
    ctx.effect(() => {
      const tick = () => {
        void runDailySweep(file).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[dsh-plugin-kanban] daily tidy-up failed: ${message}`)
        })
      }
      // Catch up immediately: a host that was closed for days clears the
      // projects that went stale meanwhile as soon as it starts again.
      tick()
      const timer = setInterval(tick, TIDY_INTERVAL_MS)
      // Do not keep the process alive only for this timer (tests import this
      // module too); the harness's own handles keep the host running.
      if (typeof timer.unref === 'function') timer.unref()
      return () => clearInterval(timer)
    }, 'dsh-kanban: daily tidy-up')
  }
}
