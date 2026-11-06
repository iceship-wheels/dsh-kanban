/**
 * Collapse empty lines that sit between two consecutive list items, so a
 * checklist imported from a block-based editor reads (and edits) as one tight
 * list. Blank lines around paragraphs, quotes and code fences are untouched.
 *
 * Usage: node tools/compact-notes.mjs [path/to/board.json]
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/
const FENCE = /^\s*(?:```|~~~)/
const isItem = (line) => LIST_ITEM.test(line)

/**
 * @param {string} text markdown notes
 * @returns {string} notes with blank lines between list items removed
 */
export function compactListGaps(text) {
  const lines = text.split('\n')
  const kept = []
  let fence = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (FENCE.test(line)) {
      fence = !fence
      kept.push(line)
      continue
    }
    if (fence || line.trim() !== '') {
      kept.push(line)
      continue
    }
    let prev = kept.length - 1
    while (prev >= 0 && kept[prev].trim() === '') prev -= 1
    let next = index + 1
    while (next < lines.length && lines[next].trim() === '') next += 1
    const betweenItems = prev >= 0 && next < lines.length && isItem(kept[prev]) && isItem(lines[next])
    if (!betweenItems) kept.push(line)
  }
  return kept.join('\n')
}

function defaultBoardPath() {
  const home = process.env.DSH_HOME ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
  return path.join(home, 'kanban', 'board.json')
}

function run(boardPath) {
  if (!existsSync(boardPath)) throw new Error(`board not found: ${boardPath}`)
  const board = JSON.parse(readFileSync(boardPath, 'utf8'))
  const projects = Array.isArray(board.projects) ? board.projects : []
  let changed = 0
  for (const project of projects) {
    if (typeof project.notes !== 'string') continue
    const compacted = compactListGaps(project.notes)
    if (compacted !== project.notes) {
      project.notes = compacted
      changed += 1
    }
  }
  const backup = boardPath.replace(/\.json$/, '.before-list-compact.json')
  if (changed > 0) {
    if (!existsSync(backup)) copyFileSync(boardPath, backup)
    writeFileSync(boardPath, JSON.stringify(board, null, 2) + '\n', 'utf8')
  }
  console.log(`compacted ${changed} of ${projects.length} projects`)
  if (changed > 0) console.log(`backup: ${backup}`)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === import.meta.filename) {
  run(process.argv[2] ?? defaultBoardPath())
}
