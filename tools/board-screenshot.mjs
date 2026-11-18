/**
 * Render the real board with the example data and capture the README images.
 *
 * The page boots `lib/client.js` through a mock module loader, stubs the host
 * fetch with a board from `examples/`, and mounts the same `KanbanPage` the app
 * shows. Headless Chrome then screenshots the page, so the images stay in sync
 * with the shipped CSS and components.
 *
 * Run: node tools/board-screenshot.mjs
 * Output: docs/board.zh.png, docs/board.en.png
 *
 * Needs a local Chrome/Edge/Chromium. Set CHROME_PATH to override the lookup.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const WIDTH = 1600
const HEIGHT = 800
const SCALE = 2

const cases = [
  { locale: 'zh', language: 'zh-CN', board: 'examples/board.zh.json', output: 'docs/board.zh.png' },
  { locale: 'en', language: 'en-US', board: 'examples/board.en.json', output: 'docs/board.en.png' },
]

/** First existing browser executable, or an explicit CHROME_PATH. */
function findChrome() {
  const candidates =
    process.platform === 'win32'
      ? [
          process.env.CHROME_PATH,
          path.join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
          path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
          path.join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
        ]
      : [
          process.env.CHROME_PATH,
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ]
  return candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0 && existsSync(candidate))
}

/** One static page: plugin CSS + the real KanbanPage + the example board. */
function buildPage({ locale, board }) {
  return `<!doctype html>
<html lang="${locale === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<title>dsh-plugin-kanban — ${locale}</title>
<style>
  html, body, #root { height: 100%; margin: 0; }
  body {
    background: #f6f6f8;
    font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", ui-sans-serif, system-ui, sans-serif;
  }
  .dsh-kanban-root { padding-bottom: 20px; }
</style>
<script src="../node_modules/react/umd/react.production.min.js"></script>
<script src="../node_modules/react-dom/umd/react-dom.production.min.js"></script>
<script>
  window.__bootError = null;
  window.addEventListener("error", (event) => {
    window.__bootError = String((event.error && event.error.stack) || event.message || "script error");
  });
  window.__ModuleLoader__ = { loaded: null, load(spec) { this.loaded = spec } };
</script>
<script src="../lib/client.js"></script>
</head>
<body>
<div id="root"></div>
<script>
(() => {
  const BOARD = ${JSON.stringify(board)};
  const LOCALE = ${JSON.stringify(locale)};
  if (!window.__ModuleLoader__ || !window.__ModuleLoader__.loaded) throw new Error("client bundle did not register");
  const api = window.__ModuleLoader__.loaded.factory((id) => {
    if (id === "react") return React;
    throw new Error("unexpected module request: " + id);
  });
  let dictionaries = null;
  const registered = [];
  const ctx = {
    effect: (fn) => fn(),
    locale: {
      register: (ns, value) => {
        dictionaries = value;
        return () => {};
      },
      bind: (ns) => (key, params) => {
        const dictionary = (dictionaries && dictionaries[LOCALE]) || (dictionaries && dictionaries.en) || {};
        let text = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key;
        if (params) text = text.replace(/\\{(\\w+)\\}/g, (match, name) => (params[name] != null ? String(params[name]) : ""));
        return text;
      },
    },
    slots: {
      inject: (name, fn) => fn(),
      register: (meta, component) => {
        registered.push({ meta, component });
        return () => {};
      },
    },
  };
  api.apply(ctx);
  const main = registered.find((entry) => entry.meta && entry.meta.name === "main");
  if (!main) throw new Error("main slot was not registered");
  const payload = JSON.stringify({ ok: true, board: BOARD, savedAt: "2026-11-16T10:10:00.000Z" });
  window.fetch = (input) => {
    const url = typeof input === "string" ? input : input && input.url ? input.url : "";
    if (!url.includes("/dsh-kanban/api/board")) return Promise.reject(new Error("unexpected fetch: " + url));
    return Promise.resolve(new Response(payload, { status: 200, headers: { "content-type": "application/json" } }));
  };
  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(main.component, {}));
})();
</script>
</body>
</html>`
}

class Cdp {
  constructor() {
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
  }

  async connect(url) {
    this.ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id === undefined) return
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    try {
      this.ws?.close()
    } catch {
      // ignore
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForJson(url, timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      // Chrome is still starting.
    }
    await sleep(120)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function capture({ htmlPath, output, language }) {
  const chrome = findChrome()
  if (chrome === undefined) throw new Error('Chrome/Edge not found; set CHROME_PATH to the browser executable')
  const port = 20000 + Math.floor(Math.random() * 20000)
  const profile = path.join(root, '.tmp', 'screenshot-profile')
  rmSync(profile, { recursive: true, force: true })
  mkdirSync(profile, { recursive: true })
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const client = new Cdp()
  try {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`)
    const page = targets.find((target) => target.type === 'page')
    if (page === undefined) throw new Error('Chrome did not expose a page target')
    await client.connect(page.webSocketDebuggerUrl)
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: SCALE,
      mobile: false,
    })
    await client.send('Emulation.setLocaleOverride', { locale: language }).catch(() => {})
    await client.send('Page.navigate', { url: pathToFileURL(htmlPath).href })
    const started = Date.now()
    let settled = ''
    while (Date.now() - started < 15000) {
      await sleep(200)
      const state = await client.send('Runtime.evaluate', {
        expression: `(() => {
          if (window.__bootError) return "error:" + window.__bootError;
          if (document.readyState !== "complete") return "loading";
          const cards = document.querySelectorAll(".dsh-kanban-card").length;
          const contents = [...document.querySelectorAll(".dsh-kanban-group-content")];
          if (contents.length === 0) return "empty:" + cards + ":" + document.body.innerHTML.length;
          return contents.map((el) => getComputedStyle(el).columnCount + ":" + el.offsetHeight).join("|");
        })()`,
        returnByValue: true,
      })
      const value = String(state.result?.value ?? '')
      if (value.startsWith('error:') || value.startsWith('empty:')) throw new Error(`board did not render: ${value.slice(0, 500)}`)
      if (value === settled && !value.startsWith('loading')) break
      settled = value
    }
    if (settled === '') throw new Error('board did not render before the timeout')
    await sleep(600)
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const target = path.join(root, output)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, Buffer.from(screenshot.data, 'base64'))
    console.log(`wrote ${output} (${WIDTH}x${HEIGHT} @${SCALE}x)`)
  } finally {
    if (client.ws !== null) await client.send('Browser.close').catch(() => {})
    client.close()
    await sleep(300)
    if (child.exitCode === null) child.kill()
  }
}

mkdirSync(path.join(root, '.tmp'), { recursive: true })
for (const entry of cases) {
  const board = JSON.parse(readFileSync(path.join(root, entry.board), 'utf8'))
  const htmlPath = path.join(root, '.tmp', `screenshot-board-${entry.locale}.html`)
  writeFileSync(htmlPath, buildPage({ ...entry, board }))
  await capture({ htmlPath, output: entry.output, language: entry.language })
}
