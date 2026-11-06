window.__ModuleLoader__.load({
	id: "dsh-plugin-kanban",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;
		const useIsomorphicLayoutEffect = typeof document === "undefined" ? react.useEffect : react.useLayoutEffect;

		/** Sidebar panel id: also the `main` slot key that shows this board. */
		const PANEL_ID = "kanban";
		/** Locale namespace owned by this plugin. */
		const NS = "kanban";
		/** Host route registered by lib/index.js. */
		const BOARD_ENDPOINT = "/dsh-kanban/api/board";
		const SAVE_DEBOUNCE_MS = 400;
		const BOARD_VERSION = 2;
		/** Browser-side mirror of the board while the host stores an older version. */
		const MIRROR_KEY = "dsh-kanban.board.v2";

		const MAX_GROUPS = 8;
		/** Upper bound for the automatic per-group column count. */
		const MAX_AUTO_COLUMNS = 4;
		const MAX_GROUP_TITLE = 40;
		/**
		 * Minimum tile width, in px. Automatic columns are never allowed to squeeze
		 * a tile below a comfortable wide-tile width, so adding columns shortens a
		 * group without making its tiles cramped.
		 */
		const MIN_COLUMN_WIDTH = 320;
		const FIT_BREAKPOINT = 1100;
		const GROUP_HEAD_ALLOWANCE = 40;
		const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
		const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

		/** Groups a board starts with; titles are user data and stay editable. */
		const DEFAULT_GROUPS = [
			{ id: "work", title: "Work" },
			{ id: "learn", title: "Learn" },
			{ id: "others", title: "Others" },
		];

		const STATUSES = [
			{ id: "idea", label: "idea" },
			{ id: "active", label: "active" },
			{ id: "paused", label: "paused" },
			{ id: "done", label: "done" },
		];
		const STATUS_BY_ID = new Map(STATUSES.map((status) => [status.id, status]));
		const ALL_STATUS_IDS = STATUSES.map((status) => status.id);

		/** Next entry of a cyclic list, wrapping around; unknown ids start at the first entry. */
		function nextInCycle(items, id) {
			const index = items.findIndex((item) => item.id === id);
			return items[(index + 1) % items.length];
		}

		const DICTIONARIES = {
			en: {
				panel: "Kanban",
				title: "Projects",
				newProject: "New project",
				filterLabel: "Filter projects by status",
				all: "All",
				idea: "Idea",
				active: "Active",
				paused: "Paused",
				done: "Done",
				groups: "Groups",
				group: "Group",
				groupColumnsAuto: "Columns auto-fit to keep groups short",
				addGroup: "Add group",
				newGroup: "New group",
				untitledGroup: "Untitled group",
				groupOverflow: "This group needs more room than the window height; the board scrolls.",
				emptyTitle: "No projects yet",
				emptyHint: "Add your first project tile to start the board.",
				emptyFiltered: "No projects match this filter.",
				untitled: "Untitled project",
				noNotes: "No notes yet — click to write markdown.",
				edit: "Edit",
				delete: "Delete",
				confirmDelete: "Click again to delete",
				save: "Save",
				cancel: "Cancel",
				doneEditing: "Done",
				status: "Status",
				cycleStatus: "Click to change status",
				cycleGroup: "Click to change group",
				notes: "Notes",
				write: "Write",
				preview: "Preview",
				clickToEdit: "Click a block to edit it",
				bold: "Bold",
				italic: "Italic",
				code: "Inline code",
				link: "Link",
				list: "Bullet list",
				heading: "Heading",
				codeBlock: "Code block",
				titlePlaceholder: "Project name",
				notesPlaceholder: "Write markdown…",
				saving: "Saving…",
				saved: "All changes saved",
				saveFailed: "Could not save — your edits are still here.",
				loadFailed: "Could not load the board.",
				retry: "Retry",
				recovered: "The board file was corrupt and has been reset.",
				restartHost: "The running Host half is the previous board version. Your grouped board is kept in this window; restart DeepSeek Harness to persist groups.",
				updated: "Updated",
				countOne: "{count} project",
				countMany: "{count} projects",
				editorHint: "Tab / Shift+Tab indent · Ctrl+B, I, E, K format · Ctrl+Enter save",
			},
			zh: {
				panel: "项目看板",
				title: "项目",
				newProject: "新建项目",
				filterLabel: "按状态筛选项目",
				all: "全部",
				idea: "想法",
				active: "进行中",
				paused: "已暂停",
				done: "已完成",
				groups: "分组",
				group: "分组",
				groupColumnsAuto: "列数自适应，尽量缩短分组",
				addGroup: "添加分组",
				newGroup: "新分组",
				untitledGroup: "未命名分组",
				groupOverflow: "该分组所需高度超过窗口，页面将出现滚动。",
				emptyTitle: "还没有项目",
				emptyHint: "创建第一张项目卡片，开始你的看板。",
				emptyFiltered: "没有符合该筛选条件的项目。",
				untitled: "未命名项目",
				noNotes: "暂无笔记 —— 点击即可写 Markdown。",
				edit: "编辑",
				delete: "删除",
				confirmDelete: "再次点击以删除",
				save: "保存",
				cancel: "取消",
				doneEditing: "完成",
				status: "状态",
				cycleStatus: "点击切换状态",
				cycleGroup: "点击切换分组",
				notes: "笔记",
				write: "编辑",
				preview: "预览",
				clickToEdit: "点击内容块开始编辑",
				bold: "加粗",
				italic: "斜体",
				code: "行内代码",
				link: "链接",
				list: "无序列表",
				heading: "标题",
				codeBlock: "代码块",
				titlePlaceholder: "项目名称",
				notesPlaceholder: "输入 Markdown…",
				saving: "保存中…",
				saved: "所有更改已保存",
				saveFailed: "保存失败 —— 你的编辑仍在。",
				loadFailed: "加载看板失败。",
				retry: "重试",
				recovered: "看板文件损坏，已重置为空看板。",
				restartHost: "当前运行的宿主仍是旧版看板结构。分组数据暂时保存在本窗口中；重启 DeepSeek Harness 后即可持久化。",
				updated: "更新于",
				countOne: "{count} 个项目",
				countMany: "{count} 个项目",
				editorHint: "Tab / Shift+Tab 缩进 · Ctrl+B、I、E、K 格式 · Ctrl+Enter 保存",
			},
		};

		const CSS = `
.dsh-kanban-root {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 18px 24px 0;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 14px;
}
.dsh-kanban-header {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
}
.dsh-kanban-heading { min-width: 0; }
.dsh-kanban-title {
  margin: 0;
  font-size: 22px;
  line-height: 28px;
  font-weight: 650;
  letter-spacing: -0.01em;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.dsh-kanban-count { font-size: 13px; font-weight: 400; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-header-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.dsh-kanban-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  /* the font's ascent sits the label low, so the bottom padding optically centers it */
  padding: 0 12px 4px;
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.dsh-kanban-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); }
.dsh-kanban-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: -2px; }
.dsh-kanban-btn-primary { border-color: transparent; background: var(--dsw-alias-label-primary, #111827); color: var(--dsw-alias-bg-base, #ffffff); }
.dsh-kanban-btn-primary:hover { background: var(--dsw-alias-label-primary, #111827); opacity: 0.88; }
.dsh-kanban-icon-btn {
  width: 28px; height: 28px; padding: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  border: none; background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  flex: none;
}
.dsh-kanban-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); color: var(--dsw-alias-label-primary, #1f2328); }
.dsh-kanban-icon-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: -2px; }
.dsh-kanban-icon-btn.is-danger:hover { color: #dc2626; }
.dsh-kanban-icon-btn.is-armed { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
.dsh-kanban-icon-btn:disabled { opacity: 0.4; cursor: default; }

.dsh-kanban-filters { flex: none; display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 12px; }
.dsh-kanban-chip {
  height: 26px; padding: 0 10px;
  border-radius: 999px; border: 0.5px solid transparent;
  background: transparent; color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 12.5px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.dsh-kanban-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); color: var(--dsw-alias-label-primary, #1f2328); }
.dsh-kanban-chip[aria-pressed="true"] {
  border-color: var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-kanban-chip:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: 0; }
.dsh-kanban-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; display: inline-block; }

.dsh-kanban-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 2px 24px;
}
.dsh-kanban-groups-row { display: flex; align-items: flex-start; gap: 16px; width: 100%; }
.dsh-kanban-groups-stack { display: flex; flex-direction: column; gap: 18px; width: 100%; }
.dsh-kanban-group { display: flex; flex-direction: column; min-width: 0; }
.dsh-kanban-groups-row > .dsh-kanban-group { min-width: 220px; }
.dsh-kanban-group-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  margin-bottom: 8px;
  min-width: 0;
}
.dsh-kanban-group-title {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-kanban-group-count {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06));
  border-radius: 999px;
  padding: 0 7px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  flex: none;
}
.dsh-kanban-group-flag { font-size: 12px; color: var(--dsw-alias-state-warn-primary, #b45309); flex: none; cursor: help; }
.dsh-kanban-group-add {
  margin-left: auto;
  width: 22px; height: 22px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary, #6b7280);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; flex: none; opacity: 0;
  transition: opacity 0.12s ease;
}
.dsh-kanban-group:hover .dsh-kanban-group-add, .dsh-kanban-group:focus-within .dsh-kanban-group-add { opacity: 1; }
.dsh-kanban-group-add:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); color: var(--dsw-alias-label-primary, #1f2328); }
@media (hover: none) { .dsh-kanban-group-add { opacity: 1; } }

.dsh-kanban-group-content { min-width: 0; column-gap: 16px; }
.dsh-kanban-card,
.dsh-kanban-editor {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  page-break-inside: avoid;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 16px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}
.dsh-kanban-card:hover { border-color: var(--dsw-alias-border-l4, var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.22))); }
.dsh-kanban-card-head { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px 0; }
.dsh-kanban-status { display: inline-flex; vertical-align: middle; margin-right: 6px; }
.dsh-kanban-status-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 8px;
  border-radius: 999px; border: 0.5px solid transparent;
  background: rgba(15, 23, 42, 0.04);
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 11.5px; font-weight: 550;
  cursor: pointer;
}
.dsh-kanban-status-btn:hover { border-color: var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14)); }
.dsh-kanban-status-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: 0; }
.dsh-kanban-card-title { flex: 1; min-width: 0; margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; overflow-wrap: anywhere; }
.dsh-kanban-card-actions { flex: none; display: flex; gap: 2px; opacity: 0; transition: opacity 0.12s ease; }
.dsh-kanban-card:hover .dsh-kanban-card-actions, .dsh-kanban-card:focus-within .dsh-kanban-card-actions { opacity: 1; }
@media (hover: none) { .dsh-kanban-card-actions { opacity: 1; } }

.dsh-kanban-md { padding: 8px 14px 10px; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary, #1f2328); }
.dsh-kanban-md > :first-child { margin-top: 0; }
.dsh-kanban-md > :last-child { margin-bottom: 0; }
.dsh-kanban-md p { margin: 0 0 8px; }
.dsh-kanban-md h1, .dsh-kanban-md h2, .dsh-kanban-md h3, .dsh-kanban-md h4, .dsh-kanban-md h5, .dsh-kanban-md h6 { margin: 14px 0 6px; font-weight: 650; line-height: 1.3; }
.dsh-kanban-md .dsh-kanban-sec-head { display: flex; align-items: center; gap: 6px; margin: 14px 0 6px; }
.dsh-kanban-md .dsh-kanban-sec-head[data-fold-index] { cursor: pointer; border-radius: 4px; user-select: none; }
.dsh-kanban-md .dsh-kanban-sec-head[data-fold-index]:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.04)); }
.dsh-kanban-md .dsh-kanban-sec-head[data-fold-index]:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: 0; }
.dsh-kanban-md .dsh-kanban-sec-head > h1, .dsh-kanban-md .dsh-kanban-sec-head > h2, .dsh-kanban-md .dsh-kanban-sec-head > h3, .dsh-kanban-md .dsh-kanban-sec-head > h4, .dsh-kanban-md .dsh-kanban-sec-head > h5, .dsh-kanban-md .dsh-kanban-sec-head > h6 { margin: 0; flex: 1; min-width: 0; }
.dsh-kanban-md .dsh-kanban-fold-toggle { flex: none; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-md .dsh-kanban-fold-toggle svg { transition: transform 0.12s ease; }
.dsh-kanban-md .dsh-kanban-sec-head[data-fold-index]:hover .dsh-kanban-fold-toggle { color: var(--dsw-alias-label-primary, #1f2328); }
.dsh-kanban-task-done { text-decoration: line-through; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-section, .dsh-kanban-md-body { display: contents; }
.dsh-kanban-md > .dsh-kanban-section:first-child > .dsh-kanban-sec-head { margin-top: 0; }
.dsh-kanban-md h1 { font-size: 17px; }
.dsh-kanban-md h2 { font-size: 15.5px; }
.dsh-kanban-md h3 { font-size: 14.5px; }
.dsh-kanban-md h4, .dsh-kanban-md h5, .dsh-kanban-md h6 { font-size: 13.5px; }
.dsh-kanban-md a { color: var(--dsw-alias-state-business-primary, #2563eb); text-decoration: none; }
.dsh-kanban-md a:hover { text-decoration: underline; }
.dsh-kanban-md code {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.92em; padding: 1px 4px; border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.07));
}
.dsh-kanban-md pre { margin: 8px 0; padding: 10px 12px; border-radius: 8px; overflow-x: auto; background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.07)); }
.dsh-kanban-md pre code { padding: 0; background: transparent; font-size: 12px; }
.dsh-kanban-md ul, .dsh-kanban-md ol { margin: 0 0 8px; padding-left: 20px; }
.dsh-kanban-md ul ul, .dsh-kanban-md ul ol, .dsh-kanban-md ol ul, .dsh-kanban-md ol ol { margin: 2px 0 2px 2px; padding-left: 18px; }
.dsh-kanban-md ul ul { list-style-type: circle; }
.dsh-kanban-md li { margin: 2px 0; }
.dsh-kanban-md li.dsh-kanban-task { list-style: none; }
.dsh-kanban-md li > input[type="checkbox"] { margin: 0 6px 0 -16px; vertical-align: middle; cursor: pointer; accent-color: var(--dsw-alias-state-business-primary, #3b82f6); }
.dsh-kanban-md blockquote { margin: 8px 0; padding: 2px 0 2px 12px; border-left: 3px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.2)); color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-md hr { margin: 12px 0; border: none; border-top: 1px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14)); }
.dsh-kanban-md table { border-collapse: collapse; margin: 8px 0; font-size: 12.5px; display: block; overflow-x: auto; }
.dsh-kanban-md th, .dsh-kanban-md td { border: 1px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14)); padding: 4px 8px; text-align: left; }
.dsh-kanban-md th { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.05)); font-weight: 600; }
.dsh-kanban-md-empty { padding: 2px 14px 10px; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 14px 10px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-card-foot .dsh-kanban-status { height: 20px; padding: 0 7px; margin: 0; font-size: 10.5px; line-height: 20px; gap: 4px; }
.dsh-kanban-card-foot .dsh-kanban-status .dsh-kanban-dot { width: 5px; height: 5px; }
.dsh-kanban-meta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dsh-kanban-editor-backdrop { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 23, 42, 0.42); backdrop-filter: blur(2px); }
.dsh-kanban-editor-dialog {
  width: min(780px, 100%);
  height: min(720px, calc(100vh - 48px));
  display: flex; flex-direction: column; gap: 12px;
  padding: 18px; box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: var(--dsw-radius-lg, 14px);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.3);
}
.dsh-kanban-editor-head { display: flex; flex-direction: column; gap: 8px; flex: none; }
.dsh-kanban-editor-dialog .dsh-kanban-title-input { font-size: 18px; font-weight: 600; padding: 8px 10px; }
.dsh-kanban-editor-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-kanban-editor-meta .dsh-kanban-status { margin: 0; }
.dsh-kanban-editor-meta .dsh-kanban-status-btn { height: 26px; padding: 0 11px; font-size: 12px; }
.dsh-kanban-editor-meta .dsh-kanban-dot { width: 6px; height: 6px; }
.dsh-kanban-group-chip { color: var(--dsw-alias-label-primary, #1f2328); font-weight: 550; }
.dsh-kanban-editor-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.dsh-kanban-editor-body .dsh-kanban-textarea { flex: 1 1 auto; min-height: 0; resize: none; padding: 10px 12px; }
.dsh-kanban-editor-body .dsh-kanban-preview { flex: 1 1 auto; min-height: 0; max-height: none; padding: 10px 12px; border-style: solid; }
.dsh-kanban-editor-body .dsh-kanban-preview .dsh-kanban-md { font-size: 14px; line-height: 1.5; }
.dsh-kanban-editor-foot { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dsh-kanban-editor-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
@media (max-width: 640px) {
  .dsh-kanban-editor-backdrop { padding: 12px; }
  .dsh-kanban-editor-dialog { height: calc(100vh - 24px); padding: 14px; }
  .dsh-kanban-editor-foot { flex-wrap: wrap; }
}
.dsh-kanban-input, .dsh-kanban-textarea {
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.18));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font: inherit;
  font-size: 13px;
  padding: 6px 8px;
}
.dsh-kanban-input:focus, .dsh-kanban-textarea:focus { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: -1px; border-color: transparent; }
.dsh-kanban-title-input { width: 100%; font-size: 15px; font-weight: 600; }
.dsh-kanban-textarea {
  min-height: 132px;
  resize: vertical;
  tab-size: 2;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace);
  font-size: 14px;
  line-height: 1.5;
  padding: 10px 12px;
}
.dsh-kanban-textarea::placeholder { color: var(--dsw-alias-label-tertiary, #8b949e); }
.dsh-kanban-tabs { display: flex; gap: 2px; align-items: center; flex: none; }
.dsh-kanban-tab {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dsh-kanban-tab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.05)); }
.dsh-kanban-tab[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.07)); color: var(--dsw-alias-label-primary, #1f2328); font-weight: 550; }
.dsh-kanban-preview {
  border: 0.5px dashed var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.18));
  border-radius: var(--dsw-radius-md, 8px);
  padding: 8px 10px;
  min-height: 80px;
  overflow: auto;
}
.dsh-kanban-preview .dsh-kanban-md { padding: 0; }
.dsh-kanban-editor-buttons { display: flex; gap: 6px; }

.dsh-kanban-banner {
  margin: 0 0 12px;
  padding: 9px 12px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 0.5px solid var(--dsw-alias-state-warn-primary, #f59e0b);
  background: rgba(245, 158, 11, 0.1);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 12.5px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.dsh-kanban-banner.is-error { border-color: #dc2626; background: rgba(220, 38, 38, 0.08); }
.dsh-kanban-save { flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); min-height: 18px; }
.dsh-kanban-save.is-error { color: #dc2626; }
.dsh-kanban-empty { border: 1px dashed var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.2)); border-radius: var(--dsw-radius-lg, 12px); padding: 56px 24px; text-align: center; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-kanban-empty h2 { margin: 0 0 6px; font-size: 16px; color: var(--dsw-alias-label-primary, #1f2328); }
.dsh-kanban-empty p { margin: 0 0 14px; font-size: 13px; }
.dsh-kanban-loading { padding: 48px 0; text-align: center; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; }

.dsh-kanban-popover-backdrop { position: absolute; inset: 0; z-index: 40; }
.dsh-kanban-popover {
  position: absolute;
  top: 58px;
  right: 24px;
  z-index: 41;
  width: 340px;
  max-width: calc(100% - 48px);
  box-sizing: border-box;
  padding: 12px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.16));
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  display: flex; flex-direction: column; gap: 8px;
}
.dsh-kanban-popover-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 650; }
.dsh-kanban-popover-row { display: flex; align-items: center; gap: 6px; }
.dsh-kanban-popover-row .dsh-kanban-input { flex: 1; min-width: 0; }
.dsh-kanban-popover-foot { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding-top: 2px; }
.dsh-kanban-popover-foot .dsh-kanban-save { line-height: 1.45; }
.dsh-kanban-popover-foot .dsh-kanban-btn { align-self: flex-end; }

.dsh-kanban-status.is-idea { color: #7c3aed; background: rgba(124, 58, 237, 0.1); }
.dsh-kanban-status.is-active { color: #1d4ed8; background: rgba(37, 99, 235, 0.1); }
.dsh-kanban-status.is-paused { color: #b45309; background: rgba(245, 158, 11, 0.14); }
.dsh-kanban-status.is-done { color: #047857; background: rgba(16, 185, 129, 0.12); }
.dsh-kanban-dot.is-idea { background: #8b5cf6; }
.dsh-kanban-dot.is-active { background: #3b82f6; }
.dsh-kanban-dot.is-paused { background: #f59e0b; }
.dsh-kanban-dot.is-done { background: #10b981; }
`;

		function injectStyles() {
			if (typeof document === "undefined") return () => {};
			const tagId = "dsh-plugin-kanban/styles.css";
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
			if (tag !== null) return () => {};
			tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-kanban";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}

		/**
		 * Escape text for HTML context. Every text node the renderer emits goes
		 * through this, so raw HTML in notes is rendered as text, never markup.
		 * @param {string} text
		 * @returns {string}
		 */
		function escapeHtml(text) {
			return String(text).replace(/[&<>"']/g, (character) => {
				switch (character) {
					case "&": return "&amp;";
					case "<": return "&lt;";
					case ">": return "&gt;";
					case '"': return "&quot;";
					default: return "&#39;";
				}
			});
		}

				function safeUrl(url) {
			const trimmed = String(url).trim();
			if (/^https?:\/\//i.test(trimmed)) return trimmed;
			if (/^mailto:[^\s]+$/i.test(trimmed)) return trimmed;
			if (/^\/[^\s]*$/.test(trimmed)) return trimmed;
			if (/^#[^\s]*$/.test(trimmed)) return trimmed;
			return undefined;
		}

		/*
		 * Sticky inline token patterns. Sticky (`y`) means `exec` only matches at
		 * `lastIndex`, so the scanner can try a token at an index without slicing
		 * the remaining string — keeping inline rendering linear in input length.
		 * Every variable-length field is bounded: markdown delimiters are short in
		 * practice, and unbounded greedy fields would backtrack quadratically on
		 * pathological input.
		 */
		const INLINE_CODE = /(`{1,16})([\s\S]*?)\1/y;
		const INLINE_IMAGE = /!\[([^\]\n]{0,300})\]\(([^)\s]{1,2048})(?:\s+"([^"]{0,300})")?\)/y;
		const INLINE_LINK = /\[([^\]\n]{0,300})\]\(([^)\s]{1,2048})(?:\s+"([^"]{0,300})")?\)/y;
		const INLINE_STRONG = /\*\*([\s\S]+?)\*\*/y;
		const INLINE_STRONG_UNDERSCORE = /__([\s\S]+?)__/y;
		const INLINE_DEL = /~~([\s\S]+?)~~/y;
		const INLINE_EM = /\*([^*\s](?:[^*]*?[^*\s])?)\*/y;
		// CommonMark: `_` never opens/closes emphasis inside a word (snake_case).
		const INLINE_EM_UNDERSCORE = /(?<![\p{L}\p{N}_])_([^_\s](?:[^_]*?[^_\s])?)_(?![\p{L}\p{N}_])/uy;
		const INLINE_AUTOLINK = /https?:\/\/[^\s<>]+/y;
		const INLINE_ESCAPE = /\\([\\`*_{}\[\]()#+\-.!~>|])/y;

		/**
		 * Emit a matched token as HTML, or `undefined` when the token is not valid
		 * markdown (an unsafe link, an empty emphasis run, ...).
		 * @param {string} kind token kind from {@link INLINE_PATTERNS}
		 * @param {RegExpExecArray} match
		 * @param {number} depth
		 * @returns {{ html: string, length: number } | undefined}
		 */
		function inlineToken(kind, match, depth) {
			const pattern = match[0];
			if (kind === "code") return { html: "<code>" + escapeHtml(match[2].trim()) + "</code>", length: pattern.length };
			if (kind === "escape") return { html: escapeHtml(match[1]), length: pattern.length };
			if (kind === "image") {
				const href = safeUrl(match[2]);
				const label = renderInline(match[1], depth + 1);
				return {
					html: href === undefined ? label : '<a href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer noopener">' + label + "</a>",
					length: pattern.length,
				};
			}
			if (kind === "link") {
				const href = safeUrl(match[2]);
				const label = renderInline(match[1], depth + 1);
				if (href === undefined) return { html: label, length: pattern.length };
				const title = match[3] === undefined ? "" : ' title="' + escapeHtml(match[3]) + '"';
				return {
					html: '<a href="' + escapeHtml(href) + '"' + title + ' target="_blank" rel="noreferrer noopener">' + label + "</a>",
					length: pattern.length,
				};
			}
			if (kind === "strong") return { html: "<strong>" + renderInline(match[1], depth + 1) + "</strong>", length: pattern.length };
			if (kind === "del") return { html: "<del>" + renderInline(match[1], depth + 1) + "</del>", length: pattern.length };
			if (kind === "em") return { html: "<em>" + renderInline(match[1], depth + 1) + "</em>", length: pattern.length };
			if (kind === "autolink") {
				const href = pattern.replace(/[.,;:!?)\]]+$/, "");
				if (href.length <= "https://".length) return undefined;
				return {
					html: '<a href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer noopener">' + escapeHtml(href) + "</a>",
					length: href.length,
				};
			}
			return undefined;
		}

		/** Token patterns in precedence order; the scanner tries each at one index. */
		const INLINE_PATTERNS = [
			{ regex: INLINE_CODE, kind: "code" },
			{ regex: INLINE_ESCAPE, kind: "escape" },
			{ regex: INLINE_IMAGE, kind: "image" },
			{ regex: INLINE_LINK, kind: "link" },
			{ regex: INLINE_STRONG, kind: "strong" },
			{ regex: INLINE_STRONG_UNDERSCORE, kind: "strong" },
			{ regex: INLINE_DEL, kind: "del" },
			{ regex: INLINE_EM, kind: "em" },
			{ regex: INLINE_EM_UNDERSCORE, kind: "em" },
			{ regex: INLINE_AUTOLINK, kind: "autolink" },
		];

		/**
		 * Render inline markdown (emphasis, code, links, strikethrough) to HTML.
		 * @param {string} text
		 * @param {number} [depth]
		 * @returns {string}
		 */
		function renderInline(text, depth = 0) {
			if (depth > 8) return escapeHtml(text);
			let out = "";
			let plain = "";
			const flushPlain = () => {
				if (plain.length > 0) {
					out += escapeHtml(plain);
					plain = "";
				}
			};
			const length = text.length;
			let i = 0;
			while (i < length) {
				const character = text[i];
				const interesting =
					character === "\\" ||
					character === "`" ||
					character === "!" ||
					character === "[" ||
					character === "*" ||
					character === "_" ||
					character === "~" ||
					(character === "h" && (text.startsWith("http://", i) || text.startsWith("https://", i)));
				if (!interesting) {
					plain += character;
					i += 1;
					continue;
				}
				let token;
				for (const pattern of INLINE_PATTERNS) {
					pattern.regex.lastIndex = i;
					const match = pattern.regex.exec(text);
					if (match === null) continue;
					token = inlineToken(pattern.kind, match, depth);
					if (token === undefined) continue;
					break;
				}
				if (token === undefined) {
					plain += character;
					i += 1;
					continue;
				}
				flushPlain();
				out += token.html;
				i += token.length;
			}
			flushPlain();
			return out;
		}

		const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

		/**
		 * Split markdown into editable blocks. Every block keeps its raw source, so
		 * the editor can swap one block between source and rendered form.
		 * @param {string} source
		 * @returns {Array<{ type: string, source: string }>}
		 */
		function splitBlocks(source) {
			const text = typeof source === "string" ? source.replace(/\r\n?/g, "\n") : "";
			const lines = text.split("\n");
			const blocks = [];
			let i = 0;
			const fenceStart = /^(\s*)(`{3,}|~{3,})\s*([\w+.-]*)\s*$/;
			const fenceClose = /^\s*(`{3,}|~{3,})\s*$/;
			const isListLine = (line) => /^(\s*)([-*+]|\d+[.)])\s+/.test(line);
			const isBlockStart = (line) =>
				/^\s*>/.test(line) ||
				fenceStart.test(line) ||
				/^#{1,6}\s+/.test(line) ||
				isListLine(line) ||
				/^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
			while (i < lines.length) {
				const line = lines[i];
				if (/^\s*$/.test(line)) {
					i += 1;
					continue;
				}
				const fence = fenceStart.exec(line);
				if (fence !== null) {
					const marker = fence[2][0];
					const buffer = [line];
					i += 1;
					let closed = false;
					while (i < lines.length) {
						const candidate = lines[i];
						buffer.push(candidate);
						i += 1;
						if (fenceClose.test(candidate) && candidate.trim()[0] === marker) {
							closed = true;
							break;
						}
					}
					void closed;
					blocks.push({ type: "code", source: buffer.join("\n") });
					continue;
				}
				if (/^#{1,6}\s+/.test(line)) {
					blocks.push({ type: "heading", source: line });
					i += 1;
					continue;
				}
				if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
					blocks.push({ type: "hr", source: line });
					i += 1;
					continue;
				}
				if (/^\s*>/.test(line)) {
					const buffer = [];
					while (i < lines.length && /^\s*>/.test(lines[i])) {
						buffer.push(lines[i]);
						i += 1;
					}
					blocks.push({ type: "quote", source: buffer.join("\n") });
					continue;
				}
				if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
					const buffer = [line, lines[i + 1]];
					i += 2;
					while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
						buffer.push(lines[i]);
						i += 1;
					}
					blocks.push({ type: "table", source: buffer.join("\n") });
					continue;
				}
				if (isListLine(line)) {
					const buffer = [];
					const blockOrdered = /^\s*\d+[.)]\s+/.test(line);
					while (i < lines.length) {
						const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
						if (item === null) break;
						buffer.push(lines[i]);
						i += 1;
						while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isListLine(lines[i])) {
							buffer.push(lines[i]);
							i += 1;
						}
						// A blank line followed by an item of the same marker kind keeps
						// the list together (loose list), matching how GFM renders it.
						let lookahead = i;
						while (lookahead < lines.length && /^\s*$/.test(lines[lookahead])) lookahead += 1;
						if (
							lookahead > i &&
							lookahead < lines.length &&
							isListLine(lines[lookahead]) &&
							/^\s*\d+[.)]\s+/.test(lines[lookahead]) === blockOrdered
						) {
							buffer.push("");
							i = lookahead;
						}
					}
					blocks.push({ type: "list", source: buffer.join("\n") });
					continue;
				}
				const buffer = [line];
				i += 1;
				while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
					buffer.push(lines[i]);
					i += 1;
				}
				blocks.push({ type: "paragraph", source: buffer.join("\n") });
			}
			return blocks;
		}

		/**
		 * Render a fenced code block source (fence lines included).
		 * @param {string} source
		 * @returns {string}
		 */
		function renderCodeBlock(source) {
			const lines = source.split("\n");
			const fence = /^(\s*)(`{3,}|~{3,})\s*([\w+.-]*)\s*$/.exec(lines[0] ?? "");
			const marker = fence === null ? "`" : fence[2][0];
			const language = fence === null ? "" : fence[3];
			const closing = new RegExp("^\\s*" + (marker === "`" ? "`" : "~") + "{3,}\\s*$");
			const body = [];
			for (let index = 1; index < lines.length; index += 1) {
				if (closing.test(lines[index])) break;
				body.push(lines[index]);
			}
			const codeClass = language.length > 0 ? ' class="language-' + escapeHtml(language) + '"' : "";
			return "<pre><code" + codeClass + ">" + escapeHtml(body.join("\n")) + "</code></pre>";
		}

		/**
		 * Render a GFM table block source.
		 * @param {string} source
		 * @returns {string}
		 */
		function renderTable(source) {
			const lines = source.split("\n");
			const splitRow = (line) => {
				let row = line.trim();
				if (row.startsWith("|")) row = row.slice(1);
				if (row.endsWith("|")) row = row.slice(0, -1);
				const cells = [];
				let current = "";
				let escaped = false;
				for (const character of row) {
					if (escaped) {
						current += character;
						escaped = false;
						continue;
					}
					if (character === "\\") {
						escaped = true;
						continue;
					}
					if (character === "|") {
						cells.push(current.trim());
						current = "";
						continue;
					}
					current += character;
				}
				cells.push(current.trim());
				return cells;
			};
			const header = splitRow(lines[0] ?? "");
			const width = header.length;
			let table = "<table><thead><tr>";
			for (let column = 0; column < width; column += 1) table += "<th>" + renderInline(header[column] ?? "") + "</th>";
			table += "</tr></thead><tbody>";
			for (let rowIndex = 2; rowIndex < lines.length; rowIndex += 1) {
				const row = splitRow(lines[rowIndex]);
				table += "<tr>";
				for (let column = 0; column < width; column += 1) table += "<td>" + renderInline(row[column] ?? "") + "</td>";
				table += "</tr>";
			}
			return table + "</tbody></table>";
		}

		/**
		 * Render a list block source (ordered/unordered/task items).
		 * @param {string} source
		 * @param {{ next: number } | undefined} taskCounter when present, task checkboxes
		 *   become interactive and carry a document-order index.
		 * @returns {string}
		 */
		function renderList(source, taskCounter) {
			const lines = source.split("\n");
			const indentWidth = (text) => text.replace(/\t/g, "    ").length;
			const root = { indent: -1, children: [], ordered: false };
			const stack = [root];
			for (const line of lines) {
				if (/^\s*$/.test(line)) continue;
				const match = /^([ \t]*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
				if (match === null) {
					// Non-list lines directly under the last item are a lazy continuation.
					if (stack.length > 1) {
						const parent = stack[stack.length - 1];
						parent.content += "\n" + line.trim();
					}
					continue;
				}
				const indent = indentWidth(match[1]);
				while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
				const parent = stack[stack.length - 1];
				let content = match[3];
				let checked = null;
				const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
				if (task !== null) {
					checked = task[1].toLowerCase() === "x";
					content = task[2];
				}
				const start = /\d/.test(match[2]) ? Number.parseInt(match[2], 10) : 1;
				const node = {
					indent,
					ordered: /\d/.test(match[2]),
					start: Number.isFinite(start) ? start : 1,
					content,
					checked,
					taskIndex: null,
					children: [],
				};
				if (checked !== null && taskCounter !== undefined) {
					node.taskIndex = taskCounter.next;
					taskCounter.next += 1;
				}
				parent.children.push(node);
				stack.push(node);
			}
			const renderChildren = (nodes) => {
				let html = "";
				let index = 0;
				while (index < nodes.length) {
					const ordered = nodes[index].ordered;
					const group = [];
					while (index < nodes.length && nodes[index].ordered === ordered) {
						group.push(nodes[index]);
						index += 1;
					}
					const tag = ordered ? "ol" : "ul";
					const start = ordered && group[0].start !== 1 ? ' start="' + String(group[0].start) + '"' : "";
					let list = "<" + tag + start + ">";
					for (const node of group) {
						let box = "";
						if (node.checked !== null) {
							if (node.taskIndex === null) {
								box = '<input type="checkbox" disabled' + (node.checked ? " checked" : "") + "> ";
							} else {
								box = '<input type="checkbox" data-task-index="' + String(node.taskIndex) + '"' + (node.checked ? " checked" : "") + "> ";
							}
						}
						const contentHtml = node.content.split("\n").map((part) => renderInline(part)).join("<br>");
						const renderedContent = node.checked === true ? '<span class="dsh-kanban-task-done">' + contentHtml + "</span>" : contentHtml;
						const nested = node.children.length > 0 ? renderChildren(node.children) : "";
						list += (node.checked === null ? "<li>" : '<li class="dsh-kanban-task">') + box + renderedContent + nested + "</li>";
					}
					html += list + "</" + tag + ">";
				}
				return html;
			};
			return root.children.length > 0 ? renderChildren(root.children) : "";
		}

		/**
		 * Render one parsed block to HTML.
		 * @param {{ type: string, source: string }} block
		 * @param {number} depth
		 * @param {{ next: number } | undefined} [taskCounter]
		 * @returns {string}
		 */
		function renderBlock(block, depth, taskCounter) {
			if (block.type === "code") return renderCodeBlock(block.source);
			if (block.type === "heading") {
				const heading = /^(#{1,6})\s+(.*)$/.exec(block.source);
				if (heading === null) return "<p>" + renderInline(block.source) + "</p>";
				const level = heading[1].length;
				return "<h" + level + ">" + renderInline(heading[2].trim()) + "</h" + level + ">";
			}
			if (block.type === "hr") return "<hr>";
			if (block.type === "quote") {
				const inner = block.source.split("\n").map((line) => line.replace(/^\s*>\s?/, "")).join("\n");
				return "<blockquote>" + renderMarkdown(inner, depth + 1) + "</blockquote>";
			}
			if (block.type === "table") return renderTable(block.source);
			if (block.type === "list") return renderList(block.source, taskCounter);
			return "<p>" + block.source.split("\n").map((line) => renderInline(line)).join("<br>") + "</p>";
		}

		/**
		 * Render a markdown document to sanitized HTML.
		 * @param {string} source
		 * @param {number} [depth]
		 * @returns {string}
		 */
		function renderMarkdown(source, depth = 0) {
			if (typeof source !== "string" || source.trim().length === 0) return "";
			// Blockquotes recurse; cap the nesting so pathological input (thousands
			// of `>` prefixes) degrades to escaped text instead of a stack overflow.
			if (depth > 12) return "<p>" + escapeHtml(source).replace(/\n/g, "<br>") + "</p>";
			const taskCounter = depth === 0 ? { next: 0 } : undefined;
			return splitBlocks(source)
				.map((block) => renderBlock(block, depth, taskCounter))
				.join("\n");
		}

		/**
		 * Split a document into foldable sections: the blocks before the first
		 * heading, then one section per heading holding the blocks until the next
		 * heading. Task checkboxes keep a document-order index for click toggling.
		 * @param {string} source
		 * @returns {Array<{ heading: { level: number, index: number, foldable: boolean, html: string } | null, html: string }>}
		 */
		function buildSections(source) {
			const blocks = splitBlocks(typeof source === "string" ? source : "");
			const taskCounter = { next: 0 };
			const sections = [{ heading: null, html: "" }];
			let current = sections[0];
			let headingIndex = 0;
			for (const block of blocks) {
				if (block.type === "heading") {
					const match = /^(#{1,6})\s+(.*)$/.exec(block.source);
					const level = match === null ? 1 : match[1].length;
					current = {
						heading: {
							level,
							index: headingIndex,
							foldable: level <= 3,
							html: renderInline(match === null ? block.source : match[2].trim()),
						},
						html: "",
					};
					headingIndex += 1;
					sections.push(current);
					continue;
				}
				const html = renderBlock(block, 0, taskCounter);
				current.html = current.html.length > 0 ? current.html + "\n" + html : html;
			}
			return sections;
		}

		/**
		 * Toggle one task checkbox in the markdown source, addressing it by its
		 * document-order index (the same order the renderer assigns).
		 * @param {string} source
		 * @param {number} targetIndex
		 * @returns {string}
		 */
		function toggleTask(source, targetIndex) {
			const text = typeof source === "string" ? source.replace(/\r\n?/g, "\n") : "";
			const lines = text.split("\n");
			let index = 0;
			let fence = null;
			for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
				const line = lines[lineIndex];
				const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
				if (fenceMatch !== null) {
					const marker = fenceMatch[1][0];
					if (fence === null) fence = marker;
					else if (fence === marker) fence = null;
					continue;
				}
				if (fence !== null) continue;
				const task = /^(\s*)([-*+]|\d+[.)])\s+\[([ xX])\]/.exec(line);
				if (task === null) continue;
				if (index === targetIndex) {
					const next = task[3].toLowerCase() === "x" ? " " : "x";
					lines[lineIndex] = line.replace(/\[([ xX])\]/, "[" + next + "]");
					return lines.join("\n");
				}
				index += 1;
			}
			return source;
		}

		/** Two spaces per indent level, matching the markdown the renderer nests. */
		const INDENT_UNIT = "  ";
		const EMPTY_LIST_LINE = /^[ \t]*(?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]*$/;
		const LINE_PREFIX = /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;

		/** Index where the line that contains `index` starts. */
		function lineStartOf(value, index) {
			return value.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
		}

		/** Index of the newline that ends the line containing `index`, or the end. */
		function lineEndOf(value, index) {
			const end = value.indexOf("\n", index);
			return end < 0 ? value.length : end;
		}

		/** Replace `remove` characters at each `at` with `text`. */
		function applyEdits(value, edits) {
			let result = "";
			let cursor = 0;
			for (const edit of edits) {
				result += value.slice(cursor, edit.at) + edit.text;
				cursor = edit.at + (edit.remove ?? 0);
			}
			return result + value.slice(cursor);
		}

		/** Map an index through a sorted list of edits. */
		function mapIndex(index, edits) {
			let shift = 0;
			for (const edit of edits) {
				if (edit.at > index) break;
				const removed = edit.remove ?? 0;
				if (edit.at + removed <= index) shift += edit.text.length - removed;
				else return edit.at + shift + (index - edit.at);
			}
			return index + shift;
		}

		/**
		 * Continue a bullet list, ordered list, task list or blockquote when Enter
		 * is pressed; an empty item ends the list instead of continuing it.
		 * @returns {{value: string, start: number, end: number} | null} null keeps the browser's own newline
		 */
		function newlineContinuation(value, start, end) {
			if (start !== end) return null;
			const lineStart = lineStartOf(value, start);
			const line = value.slice(lineStart, start);
			const list = LINE_PREFIX.exec(line);
			const quote = /^((?:[ \t]*>[ \t]?)+)/.exec(line);
			if (list === null) {
				if (quote === null) return null;
				const rest = line.slice(quote[0].length);
				if (rest.trim() === "" && start === lineEndOf(value, start)) {
					return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart };
				}
				const insert = "\n" + quote[0];
				return { value: value.slice(0, start) + insert + value.slice(start), start: start + insert.length, end: start + insert.length };
			}
			const content = line.slice(list[0].length);
			if (content.trim() === "" && start === lineEndOf(value, start)) {
				return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart };
			}
			const numbered = /^(\d+)([.)])$/.exec(list[3]);
			const marker = numbered === null ? list[3] : String(Number(numbered[1]) + 1) + numbered[2];
			const insert = "\n" + list[1] + list[2] + marker + " " + (list[5] === undefined ? "" : "[ ] ");
			return { value: value.slice(0, start) + insert + value.slice(start), start: start + insert.length, end: start + insert.length };
		}

		/**
		 * Indent or outdent every line the selection touches, or the caret's line.
		 * @returns {{value: string, start: number, end: number} | null} null when nothing changes
		 */
		function indentLines(value, start, end, outdent) {
			const first = lineStartOf(value, start);
			let last = lineStartOf(value, Math.max(start, end));
			if (end > start && end === last) last = lineStartOf(value, end - 1);
			const edits = [];
			let line = first;
			while (line <= last) {
				if (outdent) {
					let remove = 0;
					while (remove < INDENT_UNIT.length && value[line + remove] === " ") remove += 1;
					if (remove === 0 && value[line] === "\t") remove = 1;
					if (remove > 0) edits.push({ at: line, remove, text: "" });
					else {
						// A marker already at the left margin cannot outdent, so shift-tab clears it.
						const marker = value.slice(line, lineEndOf(value, line));
						if (EMPTY_LIST_LINE.test(marker)) edits.push({ at: line, remove: marker.length, text: "" });
					}
				} else if (start === end || value.slice(line, lineEndOf(value, line)).trim() !== "") {
					edits.push({ at: line, remove: 0, text: INDENT_UNIT });
				}
				const next = lineEndOf(value, line);
				if (next >= value.length) break;
				line = next + 1;
			}
			if (edits.length === 0) return null;
			return { value: applyEdits(value, edits), start: mapIndex(start, edits), end: mapIndex(end, edits) };
		}

		/**
		 * Toggle a symmetric markdown mark around the selection; with a caret it
		 * inserts the pair and leaves the caret between.
		 */
		function wrapInline(value, start, end, mark) {
			const selected = value.slice(start, end);
			if (selected.length === 0) {
				const insert = mark + mark;
				return { value: value.slice(0, start) + insert + value.slice(end), start: start + mark.length, end: start + mark.length };
			}
			if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length >= mark.length * 2) {
				const inner = selected.slice(mark.length, selected.length - mark.length);
				return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
			}
			const attached = value.slice(Math.max(0, start - mark.length), start) === mark && value.slice(end, end + mark.length) === mark;
			if (attached) {
				const from = start - mark.length;
				return { value: value.slice(0, from) + selected + value.slice(end + mark.length), start: from, end: from + selected.length };
			}
			return { value: value.slice(0, start) + mark + selected + mark + value.slice(end), start: start + mark.length, end: end + mark.length };
		}

		/** Wrap the selection as a link and select the placeholder URL. */
		function linkInline(value, start, end) {
			const insert = "[" + value.slice(start, end) + "](url)";
			const urlStart = start + insert.indexOf("url");
			return { value: value.slice(0, start) + insert + value.slice(end), start: urlStart, end: urlStart + 3 };
		}

		/** Backspace on a line that only holds an empty list marker removes the marker. */
		function backspaceListMarker(value, start, end) {
			if (start !== end || start !== lineEndOf(value, start)) return null;
			const lineStart = lineStartOf(value, start);
			if (!/^[ \t]*(?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]*$/.test(value.slice(lineStart, start))) return null;
			return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart };
		}

		const GROUP_ID_TITLE_FALLBACK = "Group";

		function newId() {
			try {
				if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			} catch {
				// fall through to the Math.random id
			}
			return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
		}

		function newGroupId() {
			return "g_" + Math.random().toString(36).slice(2, 10);
		}

				function formatTimestamp(iso) {
			const time = Date.parse(iso);
			if (!Number.isFinite(time)) return "";
			try {
				return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
			} catch {
				return new Date(time).toISOString();
			}
		}

		/**
		 * Normalize stored groups, filling in the starter set for a missing list.
		 * Column counts are computed by the layout engine, so a stored `maxColumns`
		 * is ignored.
		 * @param {unknown} value
		 * @returns {Array<{ id: string, title: string }>}
		 */
		function normalizeGroups(value) {
			if (!Array.isArray(value)) return DEFAULT_GROUPS.map((group) => ({ ...group }));
			const seen = new Set();
			const groups = [];
			for (const item of value.slice(0, MAX_GROUPS)) {
				if (!item || typeof item !== "object") continue;
				let id = typeof item.id === "string" && GROUP_ID_PATTERN.test(item.id) ? item.id : undefined;
				if (id !== undefined && seen.has(id)) continue;
				while (id === undefined || seen.has(id)) id = newGroupId();
				seen.add(id);
				const title = typeof item.title === "string" ? item.title.slice(0, MAX_GROUP_TITLE) : "";
				groups.push({ id, title });
			}
			return groups.length > 0 ? groups : DEFAULT_GROUPS.map((group) => ({ ...group }));
		}

		/**
		 * Rewrite list indentation to two spaces per nesting level, so notes written
		 * or imported with another width still line up in the editor and preview.
		 * @param {string} source
		 * @returns {string}
		 */
		function normalizeListIndent(source) {
			if (typeof source !== "string" || source.length === 0) return source;
			const lines = source.split("\n");
			const stack = [];
			let fence = null;
			let changed = false;
			for (let index = 0; index < lines.length; index += 1) {
				const line = lines[index];
				const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
				if (fenceMatch !== null) {
					const marker = fenceMatch[1][0];
					if (fence === null) fence = marker;
					else if (fence === marker) fence = null;
					continue;
				}
				if (fence !== null) continue;
				const match = /^([ \t]*)([-*+]|\d+[.)])(?:[ \t]+)(.*)$/.exec(line);
				if (match === null) continue;
				const indent = match[1].replace(/\t/g, "    ").length;
				while (stack.length > 0 && stack[stack.length - 1] >= indent) stack.pop();
				const level = stack.length;
				stack.push(indent);
				const nextIndent = "  ".repeat(level);
				if (nextIndent !== match[1]) {
					lines[index] = nextIndent + line.slice(match[1].length);
					changed = true;
				}
			}
			return changed ? lines.join("\n") : source;
		}

		/**
		 * Defensive normalization of a whole board: the host validates too, but the
		 * UI must never crash on a hand-edited file.
		 * @param {unknown} value
		 * @returns {{ version: number, groups: object[], projects: object[] }}
		 */
		function normalizeBoard(value) {
			const raw = value && typeof value === "object" ? value : {};
			const groups = normalizeGroups(raw.groups);
			const groupIds = new Set(groups.map((group) => group.id));
			const fallbackGroup = groupIds.has("others") ? "others" : groups[0].id;
			const projects = [];
			const now = new Date().toISOString();
			if (Array.isArray(raw.projects)) {
				for (const item of raw.projects) {
					if (!item || typeof item !== "object") continue;
					const id = typeof item.id === "string" && PROJECT_ID_PATTERN.test(item.id) ? item.id : newId();
					const status = typeof item.status === "string" && STATUS_BY_ID.has(item.status) ? item.status : "idea";
					const group = typeof item.group === "string" && groupIds.has(item.group) ? item.group : fallbackGroup;
					projects.push({
						id,
						title: typeof item.title === "string" ? item.title : "",
						notes: typeof item.notes === "string" ? normalizeListIndent(item.notes) : "",
						status,
						group,
						createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
						updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
					});
				}
			}
			return { version: BOARD_VERSION, groups, projects };
		}

				function statusOf(status) {
			return STATUS_BY_ID.get(status) ?? STATUSES[0];
		}

		/** Toggle one status in the filter; the "all" chip selects every status. */
		function toggleStatusFilter(selected, id) {
			if (id === "all") return ALL_STATUS_IDS;
			return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
		}

		/** Projects kept by a status filter; only the selected statuses stay visible. */
		function filterByStatus(projects, selected) {
			if (selected.length >= ALL_STATUS_IDS.length) return projects;
			return projects.filter((project) => selected.includes(project.status));
		}

		/**
		 * Choose how many columns a group should use so its content fits the
		 * available height. `contentHeight` is measured at the current column
		 * count, so the total is estimated as `contentHeight * current`.
		 * @param {number} current
		 * @param {number} contentHeight
		 * @param {number} availableHeight
		 * @param {number} maxColumns
		 * @returns {number}
		 */
		function fitColumns(current, contentHeight, availableHeight, maxColumns) {
			if (!Number.isFinite(contentHeight) || contentHeight <= 0) return current;
			if (!Number.isFinite(availableHeight) || availableHeight <= 0) return current;
			const total = contentHeight * current;
			const estimated = Math.max(1, Math.ceil(total / availableHeight));
			const target = Math.min(maxColumns, estimated);
			if (target > current) return target;
			if (target < current) {
				// Only give up columns when the wider layout fits comfortably, so
				// measurement noise cannot make the column count flip-flop.
				return total / target <= availableHeight * 0.85 ? target : current;
			}
			return current;
		}

		/**
		 * Distribute a limited number of side-by-side columns across groups in
		 * proportion to how many columns each group wants. Every group keeps at
		 * least one column, and the total never exceeds the width budget, which
		 * guarantees the minimum tile width.
		 * @param {Record<string, number>} counts group id -> desired columns
		 * @param {number} maxTotal maximum columns that fit side by side
		 * @returns {Record<string, number>}
		 */
		function allocateColumns(counts, maxTotal) {
			const ids = Object.keys(counts);
			const desiredTotal = ids.reduce((sum, id) => sum + Math.max(1, counts[id]), 0);
			if (desiredTotal <= maxTotal) return { ...counts };
			const exact = new Map(ids.map((id) => [id, (Math.max(1, counts[id]) * maxTotal) / desiredTotal]));
			const next = {};
			let used = 0;
			for (const id of ids) {
				const value = Math.max(1, Math.floor(exact.get(id)));
				next[id] = value;
				used += value;
			}
			// hand out the remaining columns to the groups with the largest fractions
			while (used < maxTotal) {
				let best = null;
				for (const id of ids) {
					if (next[id] >= counts[id]) continue;
					const fraction = exact.get(id) - Math.floor(exact.get(id));
					if (best === null || fraction > exact.get(best) - Math.floor(exact.get(best))) best = id;
				}
				if (best === null) break;
				next[best] += 1;
				used += 1;
			}
			return next;
		}

		function readMirror() {
			try {
				if (typeof localStorage === "undefined") return null;
				const text = localStorage.getItem(MIRROR_KEY);
				if (typeof text !== "string" || text.length === 0) return null;
				const parsed = JSON.parse(text);
				if (!parsed || typeof parsed !== "object" || !parsed.board) return null;
				return { board: normalizeBoard(parsed.board), savedAt: Number(parsed.savedAt) || 0 };
			} catch {
				return null;
			}
		}

		function writeMirror(board) {
			try {
				if (typeof localStorage === "undefined") return;
				localStorage.setItem(MIRROR_KEY, JSON.stringify({ savedAt: Date.now(), board }));
			} catch {
				// best effort: the host file is still the primary store
			}
		}

		function clearMirror() {
			try {
				if (typeof localStorage !== "undefined") localStorage.removeItem(MIRROR_KEY);
			} catch {
				// ignore
			}
		}

		/**
		 * Choose the board a page boots from: the host's stored board, or the
		 * local mirror kept while the host board is outdated.
		 * @param {{ board?: unknown, savedAt?: unknown }} payload GET response
		 * @param {{ board: object, savedAt: number } | null} mirror
		 * @returns {{ board: object, hostOutdated: boolean, migrateMirror: boolean }}
		 */
		function resolveLoadedBoard(payload, mirror) {
			const raw = payload && payload.board && typeof payload.board === "object" ? payload.board : {};
			const hostVersion = Number(raw.version) || 1;
			const hostSavedAt = Number(Date.parse(typeof payload?.savedAt === "string" ? payload.savedAt : "")) || 0;
			const hostBoard = normalizeBoard(raw);
			if (hostVersion >= BOARD_VERSION) {
				if (mirror !== null && mirror.savedAt > hostSavedAt) {
					return { board: mirror.board, hostOutdated: false, migrateMirror: true };
				}
				return { board: hostBoard, hostOutdated: false, migrateMirror: false };
			}
			if (mirror !== null) return { board: mirror.board, hostOutdated: true, migrateMirror: false };
			return { board: hostBoard, hostOutdated: true, migrateMirror: false };
		}

		function svgIcon(paths, size, extra) {
			return h(
				"svg",
				Object.assign(
					{
						width: size,
						height: size,
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: 1.7,
						strokeLinecap: "round",
						strokeLinejoin: "round",
						"aria-hidden": "true",
						focusable: "false",
					},
					extra,
				),
				paths.map((d, index) => h("path", { key: index, d })),
			);
		}

		/** The sidebar panel glyph: three board columns. */
		function KanbanIcon({ size }) {
			const dimension = typeof size === "number" ? size : 16;
			return h(
				"svg",
				{
					width: dimension,
					height: dimension,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.7,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					focusable: "false",
				},
				h("rect", { key: "board", x: 3, y: 4, width: 18, height: 16, rx: 2.5 }),
				h("path", { key: "col-a", d: "M9 4v16" }),
				h("path", { key: "col-b", d: "M15 4v16" }),
				h("path", { key: "dot-a", d: "M5.2 8.5h1.6" }),
				h("path", { key: "dot-b", d: "M11.2 8.5h1.6" }),
				h("path", { key: "dot-c", d: "M17.2 8.5h1.6" }),
			);
		}

		function PlusIcon({ size }) {
			return svgIcon(["M12 5v14", "M5 12h14"], size ?? 15);
		}

		function PencilIcon({ size }) {
			return svgIcon(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"], size ?? 15);
		}

		function TrashIcon({ size }) {
			return svgIcon(["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v5", "M14 11v5"], size ?? 15);
		}

		function RefreshIcon({ size }) {
			return svgIcon(["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"], size ?? 14);
		}

		function CloseIcon({ size }) {
			return svgIcon(["M6 6l12 12", "M18 6L6 18"], size ?? 14);
		}

		/**
		 * Fold state for heading sections, remembered per project for the session.
		 * Keyed by `<project>#<heading index>`.
		 */
		const FOLD_MEMORY = new Map();

		/**
		 * Rendered markdown with foldable headings (h1–h3) and click-to-toggle
		 * task checkboxes. Raw HTML stays escaped; only the renderer's own tags
		 * are interactive.
		 * @param {{ text: string, projectKey?: string, onToggleTask?: Function }} props
		 */
		function MarkdownView({ text, projectKey, onToggleTask }) {
			const [, setVersion] = react.useState(0);
			const sections = react.useMemo(() => buildSections(text), [text]);
			const foldBase = String(projectKey ?? "board");
			const toggleFold = (index) => {
				const key = foldBase + "#" + String(index);
				if (FOLD_MEMORY.get(key) === true) FOLD_MEMORY.delete(key);
				else FOLD_MEMORY.set(key, true);
				setVersion((value) => value + 1);
			};
			const onClick = (event) => {
				const target = event.target;
				if (!target || typeof target.closest !== "function") return;
				const checkbox = target.closest('input[type="checkbox"][data-task-index]');
				if (checkbox !== null && typeof onToggleTask === "function") {
					event.preventDefault();
					onToggleTask(Number(checkbox.getAttribute("data-task-index")));
					return;
				}
				const head = target.closest("[data-fold-index]");
				if (head !== null) toggleFold(Number(head.getAttribute("data-fold-index")));
			};
			return h(
				"div",
				{ className: "dsh-kanban-md", onClick },
				sections.map((section, order) => {
					if (section.heading === null) {
						return section.html.length === 0
							? null
							: h("div", { key: "lead", className: "dsh-kanban-md-body", dangerouslySetInnerHTML: { __html: section.html } });
					}
					const foldKey = foldBase + "#" + String(section.heading.index);
					const folded = section.heading.foldable && FOLD_MEMORY.get(foldKey) === true;
					const tag = "h" + String(section.heading.level);
					return h(
						"section",
						{ key: "s" + String(order), className: "dsh-kanban-section" },
						h(
							"div",
							{
								className: "dsh-kanban-sec-head",
								"data-fold-index": section.heading.foldable ? section.heading.index : undefined,
								role: section.heading.foldable ? "button" : undefined,
								tabIndex: section.heading.foldable ? 0 : undefined,
								"aria-expanded": section.heading.foldable ? !folded : undefined,
								onKeyDown: section.heading.foldable
									? (event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												toggleFold(section.heading.index);
											}
										}
									: undefined,
							},
							section.heading.foldable
								? h(
										"span",
										{ className: "dsh-kanban-fold-toggle", "aria-hidden": "true" },
										h(
											"svg",
											{
												width: 14,
												height: 14,
												viewBox: "0 0 16 16",
												fill: "currentColor",
												style: { transform: folded ? "rotate(0deg)" : "rotate(90deg)" },
											},
											h("path", { d: "M4.5 2.4 L13.2 8 L4.5 13.6 Z" }),
										),
									)
								: null,
							h(tag, { className: "dsh-kanban-sec-title", dangerouslySetInnerHTML: { __html: section.heading.html } }),
						),
						folded ? null : h("div", { className: "dsh-kanban-md-body", dangerouslySetInnerHTML: { __html: section.html } }),
					);
				}),
			);
		}

				function StatusBadge({ status, onClick, t }) {
			const meta = statusOf(status);
			const label = t(meta.label);
			const className = "dsh-kanban-status-btn dsh-kanban-status is-" + meta.id;
			if (typeof onClick !== "function") {
				return h("span", { className }, h("span", { className: "dsh-kanban-dot is-" + meta.id }), label);
			}
			return h(
				"button",
				{ type: "button", className, title: t("cycleStatus"), onClick },
				h("span", { className: "dsh-kanban-dot is-" + meta.id }),
				label,
			);
		}

		/**
		 * One project tile in read mode.
		 * @param {{ project: object, t: Function, onEdit: Function, onToggleTask: Function, onDelete: Function, onCycleStatus: Function }} props
		 */
		function ProjectCard({ project, t, onEdit, onToggleTask, onDelete, onCycleStatus }) {
			const [armed, setArmed] = react.useState(false);
			react.useEffect(() => {
				if (!armed) return undefined;
				const timer = setTimeout(() => setArmed(false), 2600);
				return () => clearTimeout(timer);
			}, [armed]);
			const updated = formatTimestamp(project.updatedAt);
			return h(
				"article",
				{ className: "dsh-kanban-card", "data-project-id": project.id },
				h(
					"div",
					{ className: "dsh-kanban-card-head" },
					h("h2", { className: "dsh-kanban-card-title" }, project.title.length > 0 ? project.title : t("untitled")),
					h(
						"div",
						{ className: "dsh-kanban-card-actions" },
						h(
							"button",
							{ type: "button", className: "dsh-kanban-icon-btn", title: t("edit"), "aria-label": t("edit"), onClick: () => onEdit(project) },
							h(PencilIcon, {}),
						),
						armed
							? h(
									"button",
									{
										type: "button",
										className: "dsh-kanban-btn",
										style: { height: "26px", padding: "0 8px", color: "#dc2626", borderColor: "#dc2626" },
										onClick: () => onDelete(project),
										onBlur: () => setArmed(false),
									},
									t("confirmDelete"),
								)
							: h(
									"button",
									{ type: "button", className: "dsh-kanban-icon-btn is-danger", title: t("delete"), "aria-label": t("delete"), onClick: () => setArmed(true) },
									h(TrashIcon, {}),
								),
					),
				),
				project.notes.trim().length > 0
					? h(MarkdownView, {
							text: project.notes,
							projectKey: project.id,
							onToggleTask: (index) => onToggleTask(project, index),
						})
					: h("div", { className: "dsh-kanban-md-empty" }, t("noNotes")),
				h(
					"div",
					{ className: "dsh-kanban-card-foot" },
					h(StatusBadge, { status: project.status, onClick: () => onCycleStatus(project), t }),
					h("span", { className: "dsh-kanban-meta" }, updated.length > 0 ? t("updated") + " " + updated : ""),
				),
			);
		}

		/**
		 * Project editor: title, status, group, and a markdown textarea with a
		 * Write / Preview switch. Preview task checkboxes toggle their source lines;
		 * preview headings fold like the read view.
		 * @param {{ initial: object, groups: object[], t: Function, autoFocusTitle?: boolean, onSave: Function, onCancel: Function }} props
		 */
		function ProjectEditor({ initial, groups, t, autoFocusTitle, label, onSave, onCancel }) {
			const [title, setTitle] = react.useState(initial.title);
			const [notes, setNotes] = react.useState(initial.notes);
			const [status, setStatus] = react.useState(statusOf(initial.status).id);
			const [group, setGroup] = react.useState(initial.group);
			const [tab, setTab] = react.useState("write");
			const titleRef = react.useRef(null);
			const textareaRef = react.useRef(null);
			const pendingSelection = react.useRef(null);

			react.useEffect(() => {
				if (autoFocusTitle && titleRef.current !== null) titleRef.current.focus();
			}, [autoFocusTitle]);

			useIsomorphicLayoutEffect(() => {
				const pending = pendingSelection.current;
				pendingSelection.current = null;
				const element = textareaRef.current;
				if (pending === null || element === null) return;
				element.focus();
				element.setSelectionRange(pending.start, pending.end);
			});

			/** Apply a { value, start, end } edit, keeping the caret where the edit put it. */
			const applyEdit = (edit) => {
				if (edit === null) return;
				const element = textareaRef.current;
				if (edit.value === notes) {
					if (element !== null) element.setSelectionRange(edit.start, edit.end);
					return;
				}
				pendingSelection.current = { start: edit.start, end: edit.end };
				setNotes(edit.value);
			};

			const onNotesKeyDown = (event) => {
				if (event.isComposing) return;
				const element = event.currentTarget;
				const value = notes;
				const start = element.selectionStart;
				const end = element.selectionEnd;
				if (event.key === "Tab") {
					event.preventDefault();
					applyEdit(indentLines(value, start, end, event.shiftKey));
					return;
				}
				if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey) {
					const edit = backspaceListMarker(value, start, end);
					if (edit !== null) {
						event.preventDefault();
						applyEdit(edit);
					}
					return;
				}
				if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
					const edit = newlineContinuation(value, start, end);
					if (edit !== null) {
						event.preventDefault();
						applyEdit(edit);
					}
					return;
				}
				if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
				const key = event.key.toLowerCase();
				const mark = key === "b" ? "**" : key === "i" ? "*" : key === "e" ? "`" : null;
				if (mark !== null) {
					event.preventDefault();
					applyEdit(wrapInline(value, start, end, mark));
					return;
				}
				if (key === "k") {
					event.preventDefault();
					applyEdit(linkInline(value, start, end));
				}
			};

			const saveNow = () => onSave({ title: title.trim(), notes, status, group });
			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
					return;
				}
				if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s") {
					event.preventDefault();
					saveNow();
					return;
				}
				if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
					saveNow();
				}
			};
			const groupOptions = groups.length > 0 ? groups : [{ id: "default", title: t("group") }];
			const groupMeta = groupOptions.find((item) => item.id === group) ?? groupOptions[0];
			const groupLabel = groupMeta.title.length > 0 ? groupMeta.title : t("untitledGroup");

			return h(
				"div",
				{
					className: "dsh-kanban-editor-backdrop",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) onCancel();
					},
				},
				h(
					"div",
					{
						className: "dsh-kanban-editor-dialog",
						role: "dialog",
						"aria-modal": "true",
						"aria-label": label ?? t("edit"),
						onKeyDown,
						onMouseDown: (event) => event.stopPropagation(),
					},
					h(
						"div",
						{ className: "dsh-kanban-editor-head" },
						h("input", {
							ref: titleRef,
							className: "dsh-kanban-input dsh-kanban-title-input",
							type: "text",
							value: title,
							maxLength: 200,
							placeholder: t("titlePlaceholder"),
							"aria-label": t("titlePlaceholder"),
							onChange: (event) => setTitle(event.target.value),
						}),
						h(
							"div",
							{ className: "dsh-kanban-editor-meta" },
							h(StatusBadge, { status, onClick: () => setStatus(nextInCycle(STATUSES, status).id), t }),
							h(
								"button",
								{
									type: "button",
									className: "dsh-kanban-status-btn dsh-kanban-group-chip",
									title: t("cycleGroup"),
									"aria-label": t("group") + ": " + groupLabel,
									onClick: () => setGroup(nextInCycle(groupOptions, group).id),
								},
								groupLabel,
							),
						),
					),
					h(
						"div",
						{ className: "dsh-kanban-editor-body" },
						h(
							"div",
							{ className: "dsh-kanban-tabs", role: "tablist" },
							h("button", { type: "button", role: "tab", className: "dsh-kanban-tab", "aria-selected": tab === "write", onClick: () => setTab("write") }, t("write")),
							h("button", { type: "button", role: "tab", className: "dsh-kanban-tab", "aria-selected": tab === "preview", onClick: () => setTab("preview") }, t("preview")),
						),
						tab === "write"
							? h("textarea", {
									ref: textareaRef,
									className: "dsh-kanban-textarea",
									value: notes,
									placeholder: t("notesPlaceholder"),
									"aria-label": t("notes"),
									onChange: (event) => setNotes(event.target.value),
									onKeyDown: onNotesKeyDown,
								})
							: h(
									"div",
									{ className: "dsh-kanban-preview" },
									notes.trim().length > 0
										? h(MarkdownView, {
												text: notes,
												projectKey: "draft",
												onToggleTask: (index) => setNotes(toggleTask(notes, index)),
											})
										: h("div", { className: "dsh-kanban-md-empty", style: { padding: 0 } }, t("noNotes")),
								),
					),
					h(
						"div",
						{ className: "dsh-kanban-editor-foot" },
						h("span", { className: "dsh-kanban-editor-hint" }, t("editorHint")),
						h(
							"div",
							{ className: "dsh-kanban-editor-buttons" },
							h("button", { type: "button", className: "dsh-kanban-btn", onClick: onCancel }, t("cancel")),
							h("button", { type: "button", className: "dsh-kanban-btn dsh-kanban-btn-primary", onClick: saveNow }, t("save")),
						),
					),
				),
			);
		}

		/**
		 * One group band: header, fit indicator, and its tiles in measured columns.
		 * @param {{ group: object, projects: object[], mode: string, columns: number, overflow: boolean, t: Function, measure: Function, renderProject: Function, onNewProject: Function }} props
		 */
		function GroupSection({ group, projects, mode, columns, overflow, t, measure, renderProject, onNewProject }) {
			const contentRef = react.useRef(null);
			useIsomorphicLayoutEffect(() => {
				const element = contentRef.current;
				if (element === null) return undefined;
				if (mode !== "fit") {
					measure(group.id, null);
					return undefined;
				}
				const report = () => measure(group.id, element.offsetHeight);
				const observer = new ResizeObserver(report);
				observer.observe(element);
				report();
				return () => observer.disconnect();
			}, [group.id, mode, columns, projects.length, measure]);
			const contentStyle = mode === "fit" ? { columnCount: columns } : undefined;
			return h(
				"section",
				{
					className: "dsh-kanban-group",
					"data-group": group.id,
				},
				h(
					"header",
					{ className: "dsh-kanban-group-head" },
					h("span", { className: "dsh-kanban-group-title", title: group.title }, group.title.length > 0 ? group.title : t("untitledGroup")),
					h("span", { className: "dsh-kanban-group-count" }, String(projects.length)),
					overflow ? h("span", { className: "dsh-kanban-group-flag", title: t("groupOverflow"), "aria-label": t("groupOverflow") }, "↕") : null,
					h(
						"button",
						{
							type: "button",
							className: "dsh-kanban-group-add",
							title: t("newProject"),
							"aria-label": t("newProject") + " — " + group.title,
							onClick: () => onNewProject(group.id),
						},
						h(PlusIcon, { size: 13 }),
					),
				),
				h("div", { className: "dsh-kanban-group-content", ref: contentRef, style: contentStyle, "data-group-content": group.id },
					projects.map((project) => renderProject(project)),
				),
			);
		}

		function GroupsPopover({ groups, t, onChange, onClose }) {
			const update = (index, patch) => onChange(groups.map((group, groupIndex) => (groupIndex === index ? { ...group, ...patch } : group)));
			return h(
				"div",
				{ className: "dsh-kanban-popover-backdrop", onMouseDown: onClose },
				h(
					"div",
					{ className: "dsh-kanban-popover", onMouseDown: (event) => event.stopPropagation(), role: "dialog", "aria-label": t("groups") },
					h(
						"div",
						{ className: "dsh-kanban-popover-head" },
						h("span", {}, t("groups")),
						h("button", { type: "button", className: "dsh-kanban-icon-btn", onClick: onClose, "aria-label": t("cancel") }, h(CloseIcon, {})),
					),
					groups.map((group, index) =>
						h(
							"div",
							{ className: "dsh-kanban-popover-row", key: group.id },
							h("input", {
								className: "dsh-kanban-input",
								type: "text",
								value: group.title,
								maxLength: MAX_GROUP_TITLE,
								placeholder: t("untitledGroup"),
								"aria-label": t("group"),
								onChange: (event) => update(index, { title: event.target.value }),
							}),
							h(
								"button",
								{ type: "button", className: "dsh-kanban-icon-btn is-danger", disabled: groups.length <= 1, onClick: () => onChange(groups.filter((item) => item.id !== group.id)), "aria-label": t("delete") },
								h(TrashIcon, { size: 14 }),
							),
						),
					),
					h(
						"div",
						{ className: "dsh-kanban-popover-foot" },
						h("span", { className: "dsh-kanban-save" }, t("groupColumnsAuto")),
						h(
							"button",
							{
								type: "button",
								className: "dsh-kanban-btn",
								onClick: () => onChange(groups.concat([{ id: newGroupId(), title: t("newGroup") }])),
							},
							h(PlusIcon, { size: 13 }),
							t("addGroup"),
						),
					),
				),
			);
		}

				function saveLabel(state, t) {
			if (state === "saving") return t("saving");
			if (state === "saved") return t("saved");
			if (state === "error") return t("saveFailed");
			return "";
		}

		/**
		 * The full-page board rendered in the `main` slot's keyed entry.
		 * @param {{ clientCtx: object, t: Function }} props
		 */
		function KanbanPage({ clientCtx, t }) {
			const [loadState, setLoadState] = react.useState("loading");
			const [loadError, setLoadError] = react.useState("");
			const [board, setBoard] = react.useState(() => normalizeBoard({}));
			const [recovered, setRecovered] = react.useState(false);
			const [hostOutdated, setHostOutdated] = react.useState(false);
			const [filter, setFilter] = react.useState(() => ALL_STATUS_IDS);
			const [editor, setEditor] = react.useState(null);
			const [groupsOpen, setGroupsOpen] = react.useState(false);
			const [saveState, setSaveState] = react.useState("idle");
			const [viewport, setViewport] = react.useState({ width: 0, height: 0 });
			const [heights, setHeights] = react.useState({});
			const [columns, setColumns] = react.useState({});
			const saveTimer = react.useRef(null);
			const pendingPayload = react.useRef(null);
			const saving = react.useRef(false);
			const saveSequence = react.useRef(0);
			const viewportRef = react.useRef(null);
			const heightsRef = react.useRef({});
			const passesRef = react.useRef({});
			const boardRef = react.useRef(board);
			boardRef.current = board;

			const load = react.useCallback(async () => {
				setLoadState("loading");
				setLoadError("");
				try {
					const response = await fetch(BOARD_ENDPOINT, { headers: { accept: "application/json" }, cache: "no-store" });
					const payload = await response.json().catch(() => null);
					if (!response.ok || payload === null || payload.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`);
					const mirror = readMirror();
					const resolved = resolveLoadedBoard(payload, mirror);
					const migrateMirror = (mirrorBoard) => {
						void fetch(BOARD_ENDPOINT, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify(mirrorBoard),
						})
							.then((response) => response.json())
							.then((result) => {
								if (Number(result && result.board && result.board.version) >= BOARD_VERSION) {
									clearMirror();
									setHostOutdated(false);
								}
							})
							.catch(() => {});
					};
					setBoard(resolved.board);
					setHostOutdated(resolved.hostOutdated);
					if (resolved.migrateMirror && mirror !== null) {
						writeMirror(resolved.board);
						migrateMirror(resolved.board);
					} else if (!resolved.hostOutdated) {
						clearMirror();
					}
					setRecovered(payload.recovered === true);
					setLoadState("ready");
				} catch (error) {
					setLoadError(error instanceof Error ? error.message : String(error));
					setLoadState("error");
				}
			}, []);

			react.useEffect(() => {
				load();
			}, [load]);

			react.useEffect(() => {
				const element = viewportRef.current;
				if (element === null) return undefined;
				const report = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
				const observer = new ResizeObserver(report);
				observer.observe(element);
				report();
				return () => observer.disconnect();
			}, []);

			const writeBoard = react.useCallback(async (payload, keepalive) => {
				const sequence = ++saveSequence.current;
				try {
					const response = await fetch(BOARD_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
						keepalive,
					});
					const result = await response.json().catch(() => null);
					if (!response.ok || result === null || result.ok !== true) throw new Error(result?.error ?? `HTTP ${response.status}`);
					const storedVersion = Number(result.board?.version) || 1;
					if (storedVersion >= BOARD_VERSION) {
						setHostOutdated(false);
						clearMirror();
					} else {
						setHostOutdated(true);
					}
					if (sequence === saveSequence.current) setSaveState("saved");
				} catch {
					if (sequence === saveSequence.current) setSaveState("error");
				}
			}, []);

			const pumpWrites = react.useCallback(async () => {
				if (saving.current) return;
				saving.current = true;
				try {
					while (pendingPayload.current !== null) {
						const payload = pendingPayload.current;
						pendingPayload.current = null;
						await writeBoard(payload, false);
					}
				} finally {
					saving.current = false;
				}
			}, [writeBoard]);

			const commit = react.useCallback(
				(nextBoard) => {
					const normalized = normalizeBoard(nextBoard);
					setBoard(normalized);
					writeMirror(normalized);
					setSaveState("saving");
					pendingPayload.current = normalized;
					if (saveTimer.current !== null) clearTimeout(saveTimer.current);
					saveTimer.current = setTimeout(() => {
						saveTimer.current = null;
						void pumpWrites();
					}, SAVE_DEBOUNCE_MS);
				},
				[pumpWrites],
			);

			react.useEffect(
				() => () => {
					if (saveTimer.current !== null) {
						clearTimeout(saveTimer.current);
						saveTimer.current = null;
					}
					const payload = pendingPayload.current;
					if (payload !== null) {
						pendingPayload.current = null;
						if (saving.current) pendingPayload.current = payload;
						else void writeBoard(payload, true);
					}
				},
				[writeBoard],
			);

			const measure = react.useCallback((groupId, height) => {
				const next = { ...heightsRef.current };
				if (height === null) delete next[groupId];
				else next[groupId] = height;
				const previous = heightsRef.current;
				const same = Object.keys(next).length === Object.keys(previous).length && Object.keys(next).every((key) => next[key] === previous[key]);
				if (same) return;
				heightsRef.current = next;
				setHeights(next);
			}, []);

			const entries = react.useMemo(() => {
				const visible = filterByStatus(board.projects, filter);
				return board.groups.map((group) => ({
					group,
					projects: visible.filter((project) => project.group === group.id),
				}));
			}, [board, filter]);

			const renderedGroups = react.useMemo(() => entries.filter((entry) => entry.projects.length > 0), [entries]);

			const fitMode = renderedGroups.length > 0 && viewport.width >= FIT_BREAKPOINT;
			const mode = fitMode ? "fit" : "stack";
			const availableHeight = Math.max(140, viewport.height - GROUP_HEAD_ALLOWANCE);
			// Side-by-side columns that still leave each column readable. The
			// per-group counts are derived from content height, never configured.
			const maxTotalColumns = Math.max(
				1,
				Math.floor(
					Math.max(0, viewport.width - Math.max(0, renderedGroups.length - 1) * 16) / MIN_COLUMN_WIDTH,
				),
			);
			const groupColumn = (groupId) => columns[groupId] ?? 1;
			const overflowing = react.useMemo(() => {
				const flagged = new Set();
				if (mode !== "fit") return flagged;
				for (const entry of renderedGroups) {
					const height = heights[entry.group.id];
					if (height !== undefined && height > availableHeight + 2) flagged.add(entry.group.id);
				}
				return flagged;
			}, [mode, renderedGroups, heights, availableHeight]);

			// A layout change (window, group set, content, filter) starts a fresh
			// adjustment budget for every group.
			react.useEffect(() => {
				passesRef.current = {};
			}, [mode, availableHeight, maxTotalColumns, board.groups, board.projects, filter]);

			// Choose each group's column count from its measured content height, then
			// keep the sum within the width budget so every column stays readable.
			react.useEffect(() => {
				if (mode !== "fit") return;
				setColumns((previous) => {
					const desired = {};
					let changed = false;
					for (const entry of renderedGroups) {
						const group = entry.group;
						const height = heights[group.id];
						const current = previous[group.id] ?? 1;
						desired[group.id] = current;
						if (height === undefined) continue;
						const passes = passesRef.current[group.id] ?? 0;
						if (passes >= 10) continue;
						const target = fitColumns(current, height, availableHeight, MAX_AUTO_COLUMNS);
						if (target !== current) {
							desired[group.id] = target;
							passesRef.current[group.id] = passes + 1;
							changed = true;
						}
					}
					const capped = allocateColumns(desired, maxTotalColumns);
					for (const entry of renderedGroups) {
						const id = entry.group.id;
						if ((previous[id] ?? 1) !== capped[id]) changed = true;
					}
					return changed ? capped : previous;
				});
			}, [heights, availableHeight, maxTotalColumns, mode, renderedGroups]);

			const openNew = (groupId) => {
				const fallback = board.groups[0];
				setGroupsOpen(false);
				setEditor({ projectId: null, groupId: groupId ?? (fallback && fallback.id) ?? "work" });
			};

			const openEdit = (project) => {
				setEditor({ projectId: project.id, groupId: project.group });
			};

			const toggleProjectTask = (project, taskIndex) => {
				const notes = toggleTask(project.notes, taskIndex);
				if (notes === project.notes) return;
				commit({
					...board,
					projects: board.projects.map((item) => (item.id === project.id ? { ...item, notes, updatedAt: new Date().toISOString() } : item)),
				});
			};

			const saveEditor = (values) => {
				if (editor === null) return;
				const groups = board.groups;
				const group = groups.some((item) => item.id === values.group) ? values.group : groups[0].id;
				const now = new Date().toISOString();
				const title = values.title.length > 0 ? values.title : t("untitled");
				if (editor.projectId === null) {
					const project = { id: newId(), title, notes: values.notes, status: values.status, group, createdAt: now, updatedAt: now };
					commit({ ...board, projects: [project, ...board.projects] });
				} else {
					commit({
						...board,
						projects: board.projects.map((project) =>
							project.id === editor.projectId
								? { ...project, title, notes: values.notes, status: values.status, group, updatedAt: now }
								: project,
						),
					});
				}
				setEditor(null);
			};

			const deleteProject = (project) => {
				commit({ ...board, projects: board.projects.filter((item) => item.id !== project.id) });
				setEditor((current) => (current !== null && current.projectId === project.id ? null : current));
			};

			const cycleStatus = (project) => {
				const next = nextInCycle(STATUSES, project.status);
				commit({
					...board,
					projects: board.projects.map((item) => (item.id === project.id ? { ...item, status: next.id, updatedAt: new Date().toISOString() } : item)),
				});
			};

			const updateGroups = (nextGroups) => {
				const groups = normalizeGroups(nextGroups);
				const groupIds = new Set(groups.map((group) => group.id));
				const fallback = groupIds.has("others") ? "others" : groups[0].id;
				const projects = board.projects.map((project) => (groupIds.has(project.group) ? project : { ...project, group: fallback }));
				setEditor((current) => {
					if (current === null) return current;
					return groupIds.has(current.groupId) ? current : { ...current, groupId: fallback };
				});
				commit({ ...board, groups, projects });
			};

			const renderProject = (project) =>
				h(ProjectCard, {
					key: project.id,
					project,
					t,
					onEdit: openEdit,
					onToggleTask: toggleProjectTask,
					onDelete: deleteProject,
					onCycleStatus: cycleStatus,
				});

			const editorProject =
				editor !== null && editor.projectId !== null ? board.projects.find((project) => project.id === editor.projectId) : undefined;
			const editorNode =
				editor === null
					? null
					: h(ProjectEditor, {
							key: editor.projectId ?? "new",
							initial:
								editorProject === undefined
									? { title: "", notes: "", status: "idea", group: editor.groupId }
									: {
											title: editorProject.title,
											notes: editorProject.notes,
											status: editorProject.status,
											group: editorProject.group,
										},
							groups: board.groups,
							t,
							autoFocusTitle: editor.projectId === null,
							label: editor.projectId === null ? t("newProject") : t("edit"),
							onSave: saveEditor,
							onCancel: () => setEditor(null),
						});

			const countLabel = projectCountLabel(board.projects.length, t);
			const filters = [{ id: "all", label: t("all") }].concat(STATUSES.map((status) => ({ id: status.id, label: t(status.label) })));

			const groupsNode =
				loadState === "loading"
					? h("div", { className: "dsh-kanban-loading" }, "…")
					: board.projects.length === 0 && editor === null
						? h(
								"div",
								{ className: "dsh-kanban-empty" },
								h("h2", {}, t("emptyTitle")),
								h("p", {}, t("emptyHint")),
								h("button", { type: "button", className: "dsh-kanban-btn dsh-kanban-btn-primary", onClick: () => openNew(null) }, h(PlusIcon, {}), t("newProject")),
							)
						: renderedGroups.length === 0
							? h(
									"div",
									{ className: "dsh-kanban-empty" },
									h("p", {}, t("emptyFiltered")),
									h("button", { type: "button", className: "dsh-kanban-btn", onClick: () => setFilter(ALL_STATUS_IDS) }, t("all")),
								)
							: h(
									"div",
									{
										className: mode === "fit" ? "dsh-kanban-groups-row" : "dsh-kanban-groups-stack",
										"data-mode": mode,
										style:
											mode === "fit"
												? {
														display: "grid",
														gridTemplateColumns: renderedGroups
															.map((entry) => {
																const count = groupColumn(entry.group.id);
																// never squeeze a column below the readable minimum width
																return (
																	"minmax(" +
																	String(count * MIN_COLUMN_WIDTH) +
																	"px, " +
																	String(count) +
																	"fr)"
																);
															})
															.join(" "),
														gap: "16px",
														alignItems: "start",
													}
												: undefined,
									},
									renderedGroups.map((entry) =>
										h(GroupSection, {
											key: entry.group.id,
											group: entry.group,
											projects: entry.projects,
											mode,
											columns: groupColumn(entry.group.id),
											overflow: overflowing.has(entry.group.id),
											t,
											measure,
											renderProject,
											onNewProject: openNew,
										}),
									),
								);

			return h(
				"div",
				{ className: "dsh-kanban-root" },
				h(
					"header",
					{ className: "dsh-kanban-header" },
					h(
						"div",
						{ className: "dsh-kanban-heading" },
						h("h1", { className: "dsh-kanban-title" }, t("title"), h("span", { className: "dsh-kanban-count" }, countLabel)),
							),
					h(
						"div",
						{ className: "dsh-kanban-header-actions" },
						h("span", { className: "dsh-kanban-save" + (saveState === "error" ? " is-error" : "") }, saveLabel(saveState, t)),
						h("button", { type: "button", className: "dsh-kanban-btn", onClick: () => setGroupsOpen(true) }, t("groups")),
						h("button", { type: "button", className: "dsh-kanban-btn dsh-kanban-btn-primary", onClick: () => openNew(null) }, h(PlusIcon, {}), t("newProject")),
					),
				),
				hostOutdated
					? h("div", { className: "dsh-kanban-banner" }, h("span", {}, t("restartHost")))
					: null,
				loadState === "error"
					? h(
							"div",
							{ className: "dsh-kanban-banner is-error" },
							h("span", {}, t("loadFailed") + (loadError.length > 0 ? " (" + loadError + ")" : "")),
							h("button", { type: "button", className: "dsh-kanban-btn", onClick: load }, h(RefreshIcon, {}), t("retry")),
						)
					: null,
				recovered
					? h(
							"div",
							{ className: "dsh-kanban-banner" },
							h("span", {}, t("recovered")),
							h("button", { type: "button", className: "dsh-kanban-icon-btn", onClick: () => setRecovered(false), "aria-label": t("cancel") }, "×"),
						)
					: null,
				h(
					"div",
					{ className: "dsh-kanban-filters", role: "group", "aria-label": t("filterLabel") },
					filters.map((item) =>
						h(
							"button",
							{
								key: item.id,
								type: "button",
								className: "dsh-kanban-chip",
								"aria-pressed": item.id === "all" ? filter.length === ALL_STATUS_IDS.length : filter.includes(item.id),
								onClick: () => setFilter((current) => toggleStatusFilter(current, item.id)),
							},
							item.id === "all" ? null : h("span", { className: "dsh-kanban-dot is-" + item.id }),
							item.label,
						),
					),
				),
				h("div", { className: "dsh-kanban-scroll", ref: viewportRef }, groupsNode),
				editorNode,
				groupsOpen ? h(GroupsPopover, { groups: board.groups, t, onChange: updateGroups, onClose: () => setGroupsOpen(false) }) : null,
			);
		}

		function projectCountLabel(count, t) {
			return (count === 1 ? t("countOne") : t("countMany")).replace("{count}", String(count));
		}

		/** Services this browser plugin needs before apply runs. */
		const inject = ["slots", "locale"];

		/**
		 * Cordis plugin entry for the browser half.
		 * @param {object} ctx client context with slots and locale services.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), "dsh-kanban: dictionaries");
			ctx.effect(() => injectStyles(), "dsh-kanban: styles");
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{ name: "sidebar.panellist", id: PANEL_ID, order: 1, label: () => t("panel"), locale: NS },
					KanbanIcon,
				),
			);
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{ name: "main", key: PANEL_ID, locale: NS },
					(props) => h(KanbanPage, { ...props, clientCtx: ctx, t }),
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = {
			renderMarkdown,
			splitBlocks,
			buildSections,
			toggleTask,
			renderInline,
			escapeHtml,
			normalizeBoard,
			normalizeGroups,
			normalizeListIndent,
			fitColumns,
			allocateColumns,
			resolveLoadedBoard,
			nextInCycle,
			toggleStatusFilter,
			filterByStatus,
			newlineContinuation,
			indentLines,
			wrapInline,
			linkInline,
			backspaceListMarker,
			DEFAULT_GROUPS,
			ProjectCard,
			ProjectEditor,
			GroupSection,
			GroupsPopover,
			KanbanPage,
			StatusBadge,
			MarkdownView,
			PANEL_ID,
			NS,
		};
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
