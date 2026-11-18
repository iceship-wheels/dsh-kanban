/**
 * Host half of the weekly kanban snapshot page.
 *
 * Reads the newest `weekly/YYYY-Www.md` snapshot of this workspace, parses the
 * at-a-glance counts, the finished projects and the previous week, and serves
 * the result to the browser half over one read-only route mounted by
 * `lib/index.js`. This module never writes a file.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const WEEK_FILE = /^(\d{4})-W(\d{2})\.md$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 200
const MAX_GROUP_SCAN_FILES = 60
const MAX_TITLE = 300
const MAX_FINISHED = 200
const DAY_MS = 24 * 60 * 60 * 1000

/** Snapshot sections this page reads. */
const SECTION_AT_A_GLANCE = 'at a glance'
const SECTION_FINISHED = 'finished'
const SECTION_IN_PROGRESS = 'in progress'

/** @param {unknown} value @returns {number | null} a non-negative integer or null. */
function toCount(value) {
  const number = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(number) && number >= 0 ? number : null
}

/** @param {unknown} value @returns {string} a single-line, length-capped title. */
function cleanTitle(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE)
}

/** @param {string} value @returns {boolean} whether it looks like a calendar date. */
function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** @param {string} text @returns {string} the text with normalized line endings and no BOM. */
function normalizeText(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
}

/**
 * Split a markdown body into its second-level sections.
 * @param {string[]} lines normalized markdown lines.
 * @param {string} heading lowercase section heading to collect.
 * @returns {string[]} the body lines of that section.
 */
function sectionLines(lines, heading) {
  const collected = []
  let inside = false
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match !== null) {
      inside = match[1].toLowerCase() === heading
      continue
    }
    if (inside) collected.push(line)
  }
  return collected
}

/**
 * Parse the snapshot's "At a glance" numbers.
 * @param {string[]} lines normalized markdown lines.
 * @returns {{ board: Record<string, number | null>, counts: Record<string, number | null> }}
 */
function parseAtAGlance(lines) {
  const board = { total: null, idea: null, active: null, paused: null, done: null }
  const counts = { finished: null, new: null, cleared: null, touched: null }
  for (const raw of lines) {
    const line = raw.trim()
    let match
    if ((match = /^-\s+\*\*Board:\*\*\s*(\d+)\s+projects?\s*[—–-]\s*(\d+)\s+idea\s*·\s*(\d+)\s+active\s*·\s*(\d+)\s+paused\s*·\s*(\d+)\s+done/i.exec(line)) !== null) {
      board.total = toCount(match[1])
      board.idea = toCount(match[2])
      board.active = toCount(match[3])
      board.paused = toCount(match[4])
      board.done = toCount(match[5])
      continue
    }
    if ((match = /^-\s+\*\*Touched this week:\*\*\s*(\d+)/i.exec(line)) !== null) {
      counts.touched = toCount(match[1])
      continue
    }
    if ((match = /^-\s+\*\*Finished this week:\*\*\s*(\d+)/i.exec(line)) !== null) {
      counts.finished = toCount(match[1])
      continue
    }
    if ((match = /^-\s+\*\*New this week:\*\*\s*(\d+)/i.exec(line)) !== null) {
      counts.new = toCount(match[1])
      continue
    }
    if ((match = /^-\s+\*\*Cleared into the archive this week:\*\*\s*(\d+)/i.exec(line)) !== null) {
      counts.cleared = toCount(match[1])
    }
  }
  return { board, counts }
}

/**
 * Parse the finished projects of one snapshot.
 * @param {string[]} lines normalized markdown lines.
 * @returns {Array<{ title: string, date: string, group: string | null }>}
 */
function parseFinished(lines) {
  const finished = []
  for (const raw of lines) {
    const match = /^-\s+\*\*(.+?)\*\*\s*[—–-]\s*last edited\s+(\d{4}-\d{2}-\d{2})\b/.exec(raw.trim())
    if (match === null) continue
    const title = cleanTitle(match[1])
    if (title.length === 0) continue
    finished.push({ title, date: match[2], group: null })
    if (finished.length >= MAX_FINISHED) break
  }
  return finished
}

/**
 * Parse the group of every in-progress project, whose line carries the group
 * title before the last-edit date. Finished lines do not carry a group, so the
 * page looks a finished project up in the earlier snapshots where it was active.
 * @param {string[]} lines normalized markdown lines.
 * @returns {Array<{ title: string, group: string }>}
 */
function parseGroupLines(lines) {
  const groups = []
  for (const raw of lines) {
    const match = /^-\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+?);\s*last edited\s+(\d{4}-\d{2}-\d{2})\b/.exec(raw.trim())
    if (match === null) continue
    const title = cleanTitle(match[1])
    const group = cleanTitle(match[2])
    if (title.length > 0 && group.length > 0) groups.push({ title, group })
  }
  return groups
}

/**
 * Parse one weekly snapshot document.
 * @param {string} markdown the snapshot file text.
 * @returns {null | { week: string, start: string, end: string, generated: string | null, board: object, counts: object, finished: Array<object> }}
 */
export function parseSnapshot(markdown) {
  if (typeof markdown !== 'string') return null
  const text = normalizeText(markdown)
  const lines = text.split('\n')
  let week = null
  let start = null
  let end = null
  for (const raw of lines) {
    const match = /^#\s+Weekly kanban snapshot\s*[—–-]\s*(\d{4}-W\d{2})\s*\((\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})\)\s*$/.exec(raw.trim())
    if (match === null) continue
    week = match[1]
    start = match[2]
    end = match[3]
    break
  }
  if (week === null || !isIsoDate(start) || !isIsoDate(end) || start > end) return null
  const generatedMatch = /^Generated\s+(.+?)\s*$/m.exec(text)
  const generated = generatedMatch === null ? null : generatedMatch[1].trim().replace(/\.$/, '')
  const atAGlance = parseAtAGlance(sectionLines(lines, SECTION_AT_A_GLANCE))
  return {
    week,
    start,
    end,
    generated: generated !== null && generated.length > 0 ? generated : null,
    board: atAGlance.board,
    counts: atAGlance.counts,
    finished: parseFinished(sectionLines(lines, SECTION_FINISHED)),
  }
}

/**
 * Read the group of every in-progress project in one snapshot.
 * @param {string} markdown the snapshot file text.
 * @returns {Array<{ title: string, group: string }>}
 */
export function parseInProgressGroups(markdown) {
  const text = normalizeText(markdown)
  return parseGroupLines(sectionLines(text.split('\n'), SECTION_IN_PROGRESS))
}

/** @param {Date} date @returns {string} the ISO week key of a UTC date. */
function isoWeekKey(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay()
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const isoYear = day.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** @param {string} start an ISO date @returns {string | null} the ISO week key before it. */
function previousWeekKey(start) {
  if (!isIsoDate(start)) return null
  const [year, month, dayOfMonth] = start.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth))
  date.setUTCDate(date.getUTCDate() - 1)
  return Number.isFinite(date.getTime()) ? isoWeekKey(date) : null
}

/**
 * List the snapshot files of one weekly directory, newest week first.
 * @param {string} directory absolute weekly directory.
 * @returns {Promise<Array<{ name: string, week: string }>>}
 */
async function listWeekFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const match = WEEK_FILE.exec(entry.name)
    if (match === null) continue
    files.push({ name: entry.name, week: `${match[1]}-W${match[2]}` })
  }
  files.sort((left, right) => (left.week < right.week ? 1 : left.week > right.week ? -1 : 0))
  return files.slice(0, MAX_FILES)
}

/** @param {string} file @returns {Promise<string | null>} a small text file, or null. */
async function readSmallText(file) {
  const info = await stat(file)
  if (!info.isFile() || info.size > MAX_FILE_BYTES) return null
  return readFile(file, 'utf8')
}

/**
 * Resolve the weekly directories worth reading: the configured workspace first,
 * then DSH's registered workspaces, the deployment default directory and the
 * launch directory.
 * @param {object} ctx host context.
 * @param {string | undefined} configured the plugin row's `workspace` config.
 * @returns {Promise<Array<{ root: string, dir: string }>>}
 */
async function findWeeklyDirectories(ctx, configured) {
  const roots = []
  const seen = new Set()
  const add = (value) => {
    if (typeof value !== 'string') return
    const root = value.trim()
    if (root.length === 0 || seen.has(root)) return
    seen.add(root)
    roots.push(root)
  }
  // An explicit workspace is authoritative: when it has a weekly directory,
  // never fall through to another workspace's snapshots.
  const explicit = typeof configured === 'string' ? configured.trim() : ''
  if (explicit.length > 0) {
    try {
      const dir = join(explicit, 'weekly')
      if ((await stat(dir)).isDirectory()) return [{ root: explicit, dir }]
    } catch {
      // A moved or mistyped workspace falls back to discovery below.
    }
  }
  add(explicit)
  try {
    const registry = ctx.get('workspaceRegistry')
    const list = registry !== undefined && typeof registry.list === 'function' ? registry.list() : []
    for (const workspace of Array.isArray(list) ? list : []) add(workspace?.path)
  } catch {
    // Optional discovery only; the configured workspace and fallbacks remain.
  }
  try {
    add(ctx.get('workingDirectory')?.defaultDirectory)
  } catch {
    // Optional service; the configured workspace and launch directory remain.
  }
  add(process.cwd())
  const directories = []
  for (const root of roots) {
    const dir = join(root, 'weekly')
    try {
      if ((await stat(dir)).isDirectory()) directories.push({ root, dir })
    } catch {
      // No weekly directory below this root.
    }
  }
  return directories
}

/** @param {object} config @returns {string | undefined} the configured workspace, if any. */
function configuredWorkspace(config) {
  if (config !== null && typeof config === 'object' && typeof config.workspace === 'string') return config.workspace
  return undefined
}

/**
 * Build the page payload for the requested snapshot, or the newest one.
 * @param {object} ctx host context.
 * @param {object} [config] the plugin row's config.
 * @param {string} [requestedWeek] a `YYYY-Www` week key to open instead of the newest.
 * @returns {Promise<object>} `{ ok: true, snapshot, previous, weeks, source }` or `{ ok: false, error }`.
 */
export async function loadWeeklySnapshot(ctx, config, requestedWeek) {
  const directories = await findWeeklyDirectories(ctx, configuredWorkspace(config))
  if (directories.length === 0) return { ok: false, error: 'no-workspace' }
  let snapshotFound = false
  for (const { dir } of directories) {
    const files = await listWeekFiles(dir).catch(() => [])
    if (files.length === 0) continue
    snapshotFound = true
    const warnings = []
    // The requested week first, then every other week newest-first, so a
    // deleted or unreadable file falls back to the latest readable snapshot.
    const requested =
      typeof requestedWeek === 'string' && /^\d{4}-W\d{2}$/.test(requestedWeek) ? requestedWeek : null
    const ordered =
      requested === null
        ? files
        : files.filter((file) => file.week === requested).concat(files.filter((file) => file.week !== requested))
    let chosen = null
    for (const file of ordered) {
      try {
        const text = await readSmallText(join(dir, file.name))
        if (text === null) {
          warnings.push(`${file.name}: file too large`)
          continue
        }
        const snapshot = parseSnapshot(text)
        if (snapshot === null) {
          warnings.push(`${file.name}: unrecognized snapshot format`)
          continue
        }
        chosen = { file, snapshot }
        break
      } catch (error) {
        warnings.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (chosen === null) continue
    // The group is not printed on a finished line; recover it from the
    // snapshots where the project was still in progress, newest wins.
    const groups = new Map()
    const groupFiles = files.slice(0, MAX_GROUP_SCAN_FILES).reverse()
    for (const file of groupFiles) {
      try {
        const text = await readSmallText(join(dir, file.name))
        if (text === null) continue
        for (const entry of parseInProgressGroups(text)) groups.set(entry.title, entry.group)
      } catch {
        // A single unreadable older snapshot does not block the newest one.
      }
    }
    const finished = chosen.snapshot.finished.map((entry) => ({
      ...entry,
      group: entry.group ?? groups.get(entry.title) ?? null,
    }))
    const previousKey = previousWeekKey(chosen.snapshot.start)
    const previousFile = previousKey === null ? undefined : files.find((file) => file.week === previousKey)
    let previous = null
    if (previousFile !== undefined) {
      try {
        const text = await readSmallText(join(dir, previousFile.name))
        const parsed = text === null ? null : parseSnapshot(text)
        if (parsed !== null) previous = { week: parsed.week, board: parsed.board, counts: parsed.counts }
      } catch {
        // No comparison beats a wrong one.
      }
    }
    return {
      ok: true,
      snapshot: { ...chosen.snapshot, finished },
      previous,
      weeks: files.map((file) => file.week),
      source: { file: chosen.file.name, files: files.length },
      warnings,
    }
  }
  return { ok: false, error: snapshotFound ? 'unreadable-snapshot' : 'no-snapshot' }
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {object} payload @param {boolean} head */
function sendJson(res, status, payload, head, headers = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  })
  if (head) res.end()
  else res.end(body)
}

/**
 * Build the read-only handler mounted at `/dsh-kanban/api/weekly`.
 * @param {object} ctx host context.
 * @param {object} [config] plugin row config.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createWeeklyHandler(ctx, config) {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' }, false, { allow: 'GET, HEAD' })
        return
      }
      const week = url.searchParams.get('week')
      const requestedWeek = typeof week === 'string' && /^\d{4}-W\d{2}$/.test(week) ? week : undefined
      const payload = await loadWeeklySnapshot(ctx, config, requestedWeek)
      sendJson(res, 200, payload, req.method === 'HEAD')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[dsh-kanban:weekly] request failed: ${message}`)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal-error' }, req.method === 'HEAD')
      else res.destroy()
    }
  }
}
