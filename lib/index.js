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
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-plugin-kanban'
export const inject = ['webServer']

/** HTTP prefix owned by this plugin. Nothing else in DSH uses it. */
const API_PREFIX = '/dsh-kanban/api'
const BOARD_ROUTE = `${API_PREFIX}/board`
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
/** Groups a board starts with; titles are user data and stay editable. */
const DEFAULT_GROUPS = [
  { id: 'work', title: 'Work' },
  { id: 'learn', title: 'Learn' },
  { id: 'others', title: 'Others' },
]

/**
 * Resolve the board file the same way the harness resolves its home:
 * `$DSH_HOME` first, then `~/.dsh`.
 * @returns {string} absolute path of the board JSON file.
 */
function boardPath() {
  const home = process.env.DSH_HOME?.trim()
  return join(home && home.length > 0 ? home : join(homedir(), '.dsh'), 'kanban', 'board.json')
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
 * Persist the board atomically (write a sibling temp file, then rename).
 * @param {string} file
 * @param {object} board
 * @returns {Promise<string>} the write timestamp.
 */
function saveBoard(file, board) {
  const task = writeQueue.then(async () => {
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temp, `${JSON.stringify(board, null, 2)}\n`, 'utf8')
      await rename(temp, file)
    } catch (error) {
      // Never leave a half-written sibling behind when the rename fails.
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
    return new Date().toISOString()
  })
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  )
  return task
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
      if (url.pathname !== BOARD_ROUTE) {
        sendJson(res, 404, { ok: false, error: 'not-found' })
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
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
        const savedAt = await saveBoard(file, board)
        sendJson(res, 200, { ok: true, board, savedAt })
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
}
