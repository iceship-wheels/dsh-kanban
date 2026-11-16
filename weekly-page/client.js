window.__ModuleLoader__.load({
	id: "@dsh-local/view-959dc1ec-8fb5-4e2b-872b-151bfde38efb",
	factory: (require) => {
		const react = require("react");
		const h = react.createElement;

		/** Sidebar panel id: also the `main` slot key that shows this page. */
		const PANEL_ID = "weekly-snapshot";
		/** Locale namespace owned by this plugin. */
		const NS = "weekly-snapshot";
		/** Read-only route registered by index.js. */
		const SNAPSHOT_ENDPOINT = "/dsh-weekly/api/snapshot";
		const STYLE_ID = "dsh-weekly-snapshot/styles.css";

		// ------------------------------------------------------------------
		// Seed: the snapshot content this page starts with. It is the last
		// known good view, replaced by the newest weekly/*.md file on load.
		// ------------------------------------------------------------------
		const SEED_FINISHED = [
			{ title: "回顾 950 训练营课件，特别是工具链相关的知识", group: "Learn", date: "2026-11-13" },
			{ title: "GLM-5.3-Flash RP3 出口性能测定", group: "Work", date: "2026-11-13" },
			{ title: "RP3 kernel NPU算子优化", group: "Work", date: "2026-11-13" },
		];
		const SEED_GROUPS = new Map(SEED_FINISHED.map((entry) => [entry.title, entry.group]));

		/** @returns {object} a fresh copy of the page's initial snapshot. */
		function seedData() {
			return {
				week: "2026-W46",
				start: "2026-11-09",
				end: "2026-11-15",
				generated: "2026-11-16 14:14 Asia/Shanghai",
				board: { total: 13, idea: 2, active: 2, paused: 6, done: 3 },
				counts: { finished: 3, new: 0, cleared: 4, touched: 11 },
				finished: SEED_FINISHED.map((entry) => ({ ...entry })),
				weeks: ["2026-W45", "2026-W46"],
				previous: {
					week: "2026-W45",
					board: { total: 16, idea: 2, active: 11, paused: 0, done: null },
					counts: { finished: 4, new: 17, cleared: 0, touched: 16 },
				},
				source: { file: "2026-W46.md", saved: true },
			};
		}

		// ------------------------------------------------------------------
		// Locale
		// ------------------------------------------------------------------
		const DICTIONARIES = {
			en: {
				panel: "Weekly",
				pageTitle: "Weekly kanban snapshot",
				refresh: "Refresh",
				refreshing: "Refreshing…",
				previousWeek: "Previous week",
				nextWeek: "Next week",
				generated: "Generated {time}",
				source: "Source {file}",
				savedSource: "{file} (saved view)",
				compare: "vs {week}",
				noPrevious: "no previous week",
				board: "Board",
				finished: "Finished",
				new: "New",
				cleared: "Cleared",
				touched: "Touched",
				projects: "projects",
				statusIdea: "Idea",
				statusActive: "Active",
				statusPaused: "Paused",
				statusDone: "Done",
				completed: "Completed this week",
				activity: "Week activity",
				thisWeek: "This week",
				lastWeek: "Last week",
				emptyFinished: "Nothing finished this week.",
				loadFailed: "Could not read the latest weekly snapshot. Showing the last saved view.",
				noSnapshot: "No weekly snapshot was found in this workspace. Showing the last saved view.",
				noWorkspace: "Could not find the weekly snapshot folder. Showing the last saved view.",
				unreadable: "The newest weekly snapshot could not be read. Showing the last saved view.",
				retry: "Retry",
				countLabel: "{count} completed",
				deltaAria: "{label} {delta} · {compare}",
				chartAria: "Week activity bar chart: finished {finished}, new {new}, cleared {cleared}, touched {touched}",
			},
			zh: {
				panel: "周报",
				pageTitle: "每周看板快照",
				refresh: "刷新",
				refreshing: "正在刷新…",
				previousWeek: "上一周",
				nextWeek: "下一周",
				generated: "生成于 {time}",
				source: "来源 {file}",
				savedSource: "{file}（已保存视图）",
				compare: "对比 {week}",
				noPrevious: "没有上一周快照",
				board: "看板",
				finished: "本周完成",
				new: "新增",
				cleared: "已清理",
				touched: "有改动",
				projects: "个项目",
				statusIdea: "想法",
				statusActive: "进行中",
				statusPaused: "已暂停",
				statusDone: "已完成",
				completed: "完成项目",
				activity: "本周活动",
				thisWeek: "本周",
				lastWeek: "上周",
				emptyFinished: "本周没有完成的项目。",
				loadFailed: "无法读取最新的每周快照，正在显示上次保存的视图。",
				noSnapshot: "此工作区的 weekly/ 中没有快照文件，正在显示上次保存的视图。",
				noWorkspace: "找不到包含 weekly/ 的工作区，正在显示上次保存的视图。",
				unreadable: "最新的每周快照格式无法识别，正在显示上次保存的视图。",
				retry: "重试",
				countLabel: "共 {count} 个",
				deltaAria: "{label} {delta} · {compare}",
				chartAria: "本周活动柱状图：已完成 {finished}，新增 {new}，已清理 {cleared}，有改动 {touched}",
			},
		};

		// ------------------------------------------------------------------
		// Styles: host theme tokens, plugin-prefixed classes.
		// ------------------------------------------------------------------
		const CSS = `
.dsh-weekly-root {
  height: 100%;
  min-height: 0;
  overflow: auto;
  box-sizing: border-box;
  padding: 28px 32px 48px;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 14px;
  line-height: 1.5;
}
.dsh-weekly-inner { max-width: 1040px; margin: 0 auto; }
.dsh-weekly-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.dsh-weekly-heading { min-width: 0; }
.dsh-weekly-eyebrow {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-weekly-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  font-size: 27px;
  line-height: 34px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.dsh-weekly-range { font-size: 14px; font-weight: 400; letter-spacing: 0; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-weekly-meta { margin-top: 6px; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #6b7280); overflow-wrap: anywhere; }
.dsh-weekly-meta-sep { margin: 0 7px; opacity: 0.55; }
.dsh-weekly-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  height: 32px;
  padding: 0 12px 2px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  border-radius: 8px;
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.dsh-weekly-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); }
.dsh-weekly-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); outline-offset: 1px; }
.dsh-weekly-btn[disabled] { opacity: 0.62; cursor: default; }
.dsh-weekly-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.dsh-weekly-nav { display: inline-flex; align-items: center; gap: 2px; }
.dsh-weekly-nav .dsh-weekly-btn { width: 30px; height: 30px; padding: 0; }
.dsh-weekly-nav-week {
  min-width: 70px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.dsh-weekly-spin { animation: dsh-weekly-spin 1s linear infinite; transform-origin: center; }
@keyframes dsh-weekly-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-weekly-spin { animation: none; } }

.dsh-weekly-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 0.5px solid var(--dsw-alias-state-warn-primary, #f59e0b);
  border-radius: 10px;
  background: var(--dsw-alias-state-warn-tertiary, rgba(245, 158, 11, 0.1));
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 12.5px;
}
.dsh-weekly-banner-text { min-width: 0; }
.dsh-weekly-banner .dsh-weekly-btn { margin-left: auto; }

.dsh-weekly-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.dsh-weekly-stat {
  min-width: 0;
  padding: 12px 14px 13px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  border-radius: 12px;
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
}
.dsh-weekly-stat-label { font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-weekly-stat-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
  font-size: 28px;
  line-height: 1.12;
  font-weight: 650;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.dsh-weekly-stat-unit { font-size: 11.5px; font-weight: 400; letter-spacing: 0; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-weekly-delta {
  display: inline-flex;
  align-items: center;
  height: 18px;
  margin-top: 7px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dsh-weekly-status { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 0 22px; }
.dsh-weekly-status-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  border-radius: 999px;
  font-size: 12px;
}
.dsh-weekly-status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dsh-weekly-status-dot.is-idea { background: var(--dsw-alias-state-done-primary, #8b5cf6); }
.dsh-weekly-status-dot.is-active { background: var(--dsw-alias-state-business-primary, #3b82f6); }
.dsh-weekly-status-dot.is-paused { background: var(--dsw-alias-state-warn-primary, #f59e0b); }
.dsh-weekly-status-dot.is-done { background: var(--dsw-alias-state-success-primary, #10b981); }
.dsh-weekly-status-name { color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-weekly-status-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.dsh-weekly-status-delta { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); font-variant-numeric: tabular-nums; }

.dsh-weekly-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.9fr); gap: 12px; align-items: start; }
.dsh-weekly-card {
  min-width: 0;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  border-radius: 12px;
  background: var(--dsw-alias-button-elevated-fill, #ffffff);
}
.dsh-weekly-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px 10px; }
.dsh-weekly-card-title { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: 0.01em; }
.dsh-weekly-card-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); font-variant-numeric: tabular-nums; }

.dsh-weekly-list { list-style: none; margin: 0; padding: 0 6px 6px; }
.dsh-weekly-item { display: flex; gap: 10px; padding: 11px 10px; border-top: 0.5px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.08)); }
.dsh-weekly-item-main { flex: 1; min-width: 0; }
.dsh-weekly-check { flex: none; margin-top: 2px; color: var(--dsw-alias-state-success-primary, #10b981); }
.dsh-weekly-item-title { font-size: 13.5px; font-weight: 550; line-height: 1.45; overflow-wrap: anywhere; }
.dsh-weekly-item-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 3px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-weekly-group {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
}
.dsh-weekly-date { font-variant-numeric: tabular-nums; }
.dsh-weekly-empty { padding: 20px 16px 26px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12.5px; }

.dsh-weekly-legend { display: flex; align-items: center; gap: 12px; }
.dsh-weekly-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dsh-weekly-swatch { width: 8px; height: 8px; border-radius: 2px; }
.dsh-weekly-swatch.is-current { background: var(--dsw-alias-state-business-primary, #2563eb); }
.dsh-weekly-swatch.is-previous { background: var(--dsw-alias-interactive-bg-hover-solid, #dfe5ee); }
.dsh-weekly-chart { padding: 2px 16px 16px; }
.dsh-weekly-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 118px;
  padding: 0 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.08));
}
.dsh-weekly-bar-pair { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: 100%; min-width: 0; }
.dsh-weekly-bar { width: 12px; max-width: 38%; min-height: 3px; border-radius: 3px 3px 0 0; }
.dsh-weekly-bar.is-current { background: var(--dsw-alias-state-business-primary, #2563eb); }
.dsh-weekly-bar.is-previous { background: var(--dsw-alias-interactive-bg-hover-solid, #dfe5ee); }
.dsh-weekly-bar-meta { display: flex; gap: 8px; padding: 8px 4px 0; }
.dsh-weekly-bar-meta > div { flex: 1; min-width: 0; text-align: center; }
.dsh-weekly-bar-value { font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dsh-weekly-bar-label { margin-top: 1px; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

@media (max-width: 900px) {
  .dsh-weekly-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsh-weekly-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .dsh-weekly-root { padding: 20px 16px 36px; }
  .dsh-weekly-head { flex-direction: column; }
  .dsh-weekly-actions { width: 100%; justify-content: space-between; }
  .dsh-weekly-stats { grid-template-columns: minmax(0, 1fr); }
}
`;

		function injectStyles() {
			if (typeof document === "undefined") return () => {};
			const existing = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]');
			if (existing !== null) return () => {};
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-weekly-snapshot";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
			};
		}

		// ------------------------------------------------------------------
		// Payload normalization. The host is trusted, but the page must survive
		// a missing field, a partial file or a route that answers something else.
		// ------------------------------------------------------------------
		function asCount(value) {
			if (value === null || value === undefined) return null;
			const number = Number(value);
			return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
		}

		function asText(value, maxLength) {
			return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength ?? 400) : "";
		}

		function normalizeBoard(value) {
			const raw = value !== null && typeof value === "object" ? value : {};
			return {
				total: asCount(raw.total),
				idea: asCount(raw.idea),
				active: asCount(raw.active),
				paused: asCount(raw.paused),
				done: asCount(raw.done),
			};
		}

		function normalizeCounts(value) {
			const raw = value !== null && typeof value === "object" ? value : {};
			return {
				finished: asCount(raw.finished),
				new: asCount(raw.new),
				cleared: asCount(raw.cleared),
				touched: asCount(raw.touched),
			};
		}

		function normalizeFinished(value) {
			if (!Array.isArray(value)) return [];
			const finished = [];
			for (const entry of value) {
				if (entry === null || typeof entry !== "object") continue;
				const title = asText(entry.title);
				if (title.length === 0) continue;
				const date = typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : null;
				const group = asText(entry.group, 80) || SEED_GROUPS.get(title) || null;
				finished.push({ title, date, group });
			}
			return finished;
		}

		function normalizePrevious(value) {
			if (value === null || typeof value !== "object") return null;
			const week = asText(value.week, 20);
			if (!/^\d{4}-W\d{2}$/.test(week)) return null;
			return { week, board: normalizeBoard(value.board), counts: normalizeCounts(value.counts) };
		}

		/** @returns {{data?: object, error?: string}} the normalized page data or an error code. */
		function normalizePayload(payload) {
			if (payload === null || typeof payload !== "object" || payload.ok !== true) {
				return { error: payload !== null && typeof payload === "object" && typeof payload.error === "string" ? payload.error : "load-failed" };
			}
			const snapshot = payload.snapshot;
			if (snapshot === null || typeof snapshot !== "object") return { error: "load-failed" };
			const week = asText(snapshot.week, 20);
			if (!/^\d{4}-W\d{2}$/.test(week)) return { error: "load-failed" };
			const source = payload.source !== null && typeof payload.source === "object" ? payload.source : {};
			const file = asText(source.file, 160);
			const weeks = Array.isArray(payload.weeks)
				? payload.weeks.filter((value) => typeof value === "string" && /^\d{4}-W\d{2}$/.test(value))
				: [];
			if (!weeks.includes(week)) weeks.push(week);
			weeks.sort();
			return {
				data: {
					week,
					start: asText(snapshot.start, 20),
					end: asText(snapshot.end, 20),
					generated: asText(snapshot.generated, 120) || null,
					board: normalizeBoard(snapshot.board),
					counts: normalizeCounts(snapshot.counts),
					finished: normalizeFinished(snapshot.finished),
					weeks,
					previous: normalizePrevious(payload.previous),
					source: file.length > 0 ? { file, saved: false } : null,
				},
			};
		}

		// ------------------------------------------------------------------
		// Presentation helpers
		// ------------------------------------------------------------------
		function deltaOf(value, previous) {
			if (value === null || previous === null || value === undefined || previous === undefined) return null;
			const difference = value - previous;
			return {
				difference,
				text: difference === 0 ? "±0" : difference > 0 ? "+" + String(difference) : "−" + String(Math.abs(difference)),
			};
		}

		function RefreshIcon({ spinning }) {
			return h(
				"svg",
				{
					width: 13,
					height: 13,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 2,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					className: spinning ? "dsh-weekly-spin" : undefined,
				},
				h("path", { d: "M20 11a8 8 0 1 0-2.3 5.7" }),
				h("path", { d: "M20 4v7h-7" }),
			);
		}

		function ChevronIcon({ direction }) {
			return h(
				"svg",
				{
					width: 14,
					height: 14,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 2,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
				},
				h("path", { d: direction === "left" ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6" }),
			);
		}

		function CheckIcon() {
			return h(
				"svg",
				{
					className: "dsh-weekly-check",
					width: 18,
					height: 18,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 2,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
				},
				h("circle", { cx: 12, cy: 12, r: 9, opacity: 0.3 }),
				h("path", { d: "m8.2 12.3 2.6 2.6 5-5.4" }),
			);
		}

		function WeeklyIcon({ size }) {
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
				h("rect", { key: "card", x: 3.2, y: 4.8, width: 17.6, height: 15.4, rx: 2.6 }),
				h("path", { key: "line", d: "M3.2 9.4h17.6" }),
				h("path", { key: "ring-a", d: "M8 3v3" }),
				h("path", { key: "ring-b", d: "M16 3v3" }),
				h("path", { key: "bar-a", d: "M8 17v-3" }),
				h("path", { key: "bar-b", d: "M12 17v-5" }),
				h("path", { key: "bar-c", d: "M16 17v-2" }),
			);
		}

		function valueText(value) {
			return value === null ? "—" : String(value);
		}

		function StatCard({ label, value, previous, unit, compare, t }) {
			const delta = deltaOf(value, previous);
			return h(
				"div",
				{ className: "dsh-weekly-stat" },
				h("div", { className: "dsh-weekly-stat-label" }, label),
				h(
					"div",
					{ className: "dsh-weekly-stat-value" },
					valueText(value),
					unit !== undefined ? h("span", { className: "dsh-weekly-stat-unit" }, unit) : null,
				),
				delta === null
					? null
					: h(
							"span",
							{
								className: "dsh-weekly-delta",
								title: compare,
								"aria-label": t("deltaAria", { label, delta: delta.text, compare }),
							},
							delta.text,
						),
			);
		}

		function CompletedList({ data, t }) {
			const count = data.counts.finished === null ? data.finished.length : data.counts.finished;
			return h(
				"section",
				{ className: "dsh-weekly-card", "aria-labelledby": "dsh-weekly-completed-title" },
				h(
					"div",
					{ className: "dsh-weekly-card-head" },
					h("h2", { id: "dsh-weekly-completed-title", className: "dsh-weekly-card-title" }, t("completed")),
					h("span", { className: "dsh-weekly-card-note" }, t("countLabel", { count })),
				),
				data.finished.length === 0
					? h("div", { className: "dsh-weekly-empty" }, t("emptyFinished"))
					: h(
							"ul",
							{ className: "dsh-weekly-list" },
							data.finished.map((entry, index) =>
								h(
									"li",
									{ key: entry.title + "#" + String(index), className: "dsh-weekly-item" },
									h(CheckIcon, {}),
									h(
										"div",
										{ className: "dsh-weekly-item-main" },
										h("div", { className: "dsh-weekly-item-title" }, entry.title),
										h(
											"div",
											{ className: "dsh-weekly-item-meta" },
											entry.group !== null ? h("span", { className: "dsh-weekly-group" }, entry.group) : null,
											entry.date !== null
												? h("time", { className: "dsh-weekly-date", dateTime: entry.date }, entry.date)
												: null,
										),
									),
								),
							),
						),
			);
		}

		function ActivityChart({ data, t }) {
			const previous = data.previous;
			const metrics = [
				{ key: "finished", label: t("finished"), current: data.counts.finished, previous: previous === null ? null : previous.counts.finished },
				{ key: "new", label: t("new"), current: data.counts.new, previous: previous === null ? null : previous.counts.new },
				{ key: "cleared", label: t("cleared"), current: data.counts.cleared, previous: previous === null ? null : previous.counts.cleared },
				{ key: "touched", label: t("touched"), current: data.counts.touched, previous: previous === null ? null : previous.counts.touched },
			];
			let maximum = 1;
			for (const metric of metrics) {
				if (metric.current !== null) maximum = Math.max(maximum, metric.current);
				if (metric.previous !== null) maximum = Math.max(maximum, metric.previous);
			}
			const barStyle = (value) => (value === null ? null : { height: value <= 0 ? "2%" : String(Math.max(4, (value / maximum) * 100)) + "%" });
			return h(
				"section",
				{ className: "dsh-weekly-card", "aria-labelledby": "dsh-weekly-activity-title" },
				h(
					"div",
					{ className: "dsh-weekly-card-head" },
					h("h2", { id: "dsh-weekly-activity-title", className: "dsh-weekly-card-title" }, t("activity")),
					h(
						"div",
						{ className: "dsh-weekly-legend" },
						h("span", { className: "dsh-weekly-legend-item" }, h("span", { className: "dsh-weekly-swatch is-current" }), t("thisWeek")),
						previous !== null
							? h("span", { className: "dsh-weekly-legend-item" }, h("span", { className: "dsh-weekly-swatch is-previous" }), t("lastWeek"))
							: null,
					),
				),
				h(
					"div",
					{ className: "dsh-weekly-chart" },
					h(
						"div",
						{
							className: "dsh-weekly-bars",
							role: "img",
							"aria-label": t("chartAria", {
								finished: valueText(data.counts.finished),
								new: valueText(data.counts.new),
								cleared: valueText(data.counts.cleared),
								touched: valueText(data.counts.touched),
							}),
						},
						metrics.map((metric) =>
							h(
								"div",
								{ key: metric.key, className: "dsh-weekly-bar-pair" },
								barStyle(metric.previous) === null ? null : h("div", { className: "dsh-weekly-bar is-previous", style: barStyle(metric.previous) }),
								barStyle(metric.current) === null ? null : h("div", { className: "dsh-weekly-bar is-current", style: barStyle(metric.current) }),
							),
						),
					),
					h(
						"div",
						{ className: "dsh-weekly-bar-meta" },
						metrics.map((metric) =>
							h(
								"div",
								{ key: metric.key },
								h("div", { className: "dsh-weekly-bar-value" }, valueText(metric.current)),
								h("div", { className: "dsh-weekly-bar-label" }, metric.label),
							),
						),
					),
				),
			);
		}

		// ------------------------------------------------------------------
		// Page
		// ------------------------------------------------------------------
		function WeeklyPage({ t }) {
			const [data, setData] = react.useState(seedData);
			const [errorCode, setErrorCode] = react.useState(null);
			const [busy, setBusy] = react.useState(true);
			const requestRef = react.useRef(0);

			const load = react.useCallback(async (week) => {
				const request = requestRef.current + 1;
				requestRef.current = request;
				setBusy(true);
				try {
					const endpoint =
						typeof week === "string" && /^\d{4}-W\d{2}$/.test(week)
							? SNAPSHOT_ENDPOINT + "?week=" + encodeURIComponent(week)
							: SNAPSHOT_ENDPOINT;
					const response = await fetch(endpoint, {
						headers: { accept: "application/json" },
						cache: "no-store",
					});
					const payload = await response.json().catch(() => null);
					if (request !== requestRef.current) return;
					const result = normalizePayload(payload);
					if (result.error !== undefined) {
						setErrorCode(result.error);
						return;
					}
					setData(result.data);
					setErrorCode(null);
				} catch {
					if (request !== requestRef.current) return;
					setErrorCode("load-failed");
				} finally {
					if (request === requestRef.current) setBusy(false);
				}
			}, []);

			react.useEffect(() => {
				void load();
			}, [load]);

			react.useEffect(() => {
				return () => {
					requestRef.current += 1;
				};
			}, []);

			react.useEffect(() => {
				if (typeof document === "undefined") return undefined;
				const onVisibility = () => {
					if (document.visibilityState === "visible") void load();
				};
				document.addEventListener("visibilitychange", onVisibility);
				return () => document.removeEventListener("visibilitychange", onVisibility);
			}, [load]);

			const previous = data.previous;
			const compare = previous === null ? t("noPrevious") : t("compare", { week: previous.week });
			const board = data.board;
			const stats = [
				{ key: "board", label: t("board"), value: board.total, previous: previous === null ? null : previous.board.total, unit: t("projects") },
				{ key: "finished", label: t("finished"), value: data.counts.finished, previous: previous === null ? null : previous.counts.finished },
				{ key: "new", label: t("new"), value: data.counts.new, previous: previous === null ? null : previous.counts.new },
				{ key: "cleared", label: t("cleared"), value: data.counts.cleared, previous: previous === null ? null : previous.counts.cleared },
				{ key: "touched", label: t("touched"), value: data.counts.touched, previous: previous === null ? null : previous.counts.touched },
			];
			const statuses = [
				{ key: "idea", label: t("statusIdea"), value: board.idea, previous: previous === null ? null : previous.board.idea },
				{ key: "active", label: t("statusActive"), value: board.active, previous: previous === null ? null : previous.board.active },
				{ key: "paused", label: t("statusPaused"), value: board.paused, previous: previous === null ? null : previous.board.paused },
				{ key: "done", label: t("statusDone"), value: board.done, previous: previous === null ? null : previous.board.done },
			];
			const fileLabel = data.source !== null && typeof data.source.file === "string" ? "weekly/" + data.source.file : null;
			const weekIndex = data.weeks.indexOf(data.week);
			const previousWeek = weekIndex > 0 ? data.weeks[weekIndex - 1] : null;
			const nextWeek = weekIndex >= 0 && weekIndex < data.weeks.length - 1 ? data.weeks[weekIndex + 1] : null;
			const sourceText =
				fileLabel === null
					? null
					: data.source.saved === true
						? t("savedSource", { file: fileLabel })
						: t("source", { file: fileLabel });
			const metaParts = [];
			if (data.generated !== null) metaParts.push(t("generated", { time: data.generated }));
			if (sourceText !== null) metaParts.push(sourceText);
			metaParts.push(compare);

			let errorMessage = null;
			if (errorCode !== null) {
				if (errorCode === "no-snapshot") errorMessage = t("noSnapshot");
				else if (errorCode === "no-workspace") errorMessage = t("noWorkspace");
				else if (errorCode === "unreadable-snapshot") errorMessage = t("unreadable");
				else errorMessage = t("loadFailed");
			}

			return h(
				"div",
				{ className: "dsh-weekly-root" },
				h(
					"div",
					{ className: "dsh-weekly-inner" },
					h(
						"header",
						{ className: "dsh-weekly-head" },
						h(
							"div",
							{ className: "dsh-weekly-heading" },
							h("div", { className: "dsh-weekly-eyebrow" }, t("pageTitle")),
							h(
								"h1",
								{ className: "dsh-weekly-title" },
								data.week,
								data.start.length > 0 && data.end.length > 0
									? h("span", { className: "dsh-weekly-range" }, data.start + " → " + data.end)
									: null,
							),
							h(
								"div",
								{ className: "dsh-weekly-meta" },
								metaParts.map((part, index) =>
									h(
										react.Fragment,
										{ key: index },
										index > 0 ? h("span", { className: "dsh-weekly-meta-sep" }, "·") : null,
										h("span", {}, part),
									),
								),
							),
						),
						h(
							"div",
							{ className: "dsh-weekly-actions" },
							h(
								"div",
								{ className: "dsh-weekly-nav", role: "group", "aria-label": t("pageTitle") },
								h(
									"button",
									{
										type: "button",
										className: "dsh-weekly-btn",
										onClick: () => void load(previousWeek),
										disabled: busy || previousWeek === null,
										"aria-label": t("previousWeek"),
										title: t("previousWeek"),
									},
									h(ChevronIcon, { direction: "left" }),
								),
								h("span", { className: "dsh-weekly-nav-week" }, data.week),
								h(
									"button",
									{
										type: "button",
										className: "dsh-weekly-btn",
										onClick: () => void load(nextWeek),
										disabled: busy || nextWeek === null,
										"aria-label": t("nextWeek"),
										title: t("nextWeek"),
									},
									h(ChevronIcon, { direction: "right" }),
								),
							),
							h(
								"button",
								{
									type: "button",
									className: "dsh-weekly-btn",
									onClick: () => void load(),
									disabled: busy,
									"aria-label": busy ? t("refreshing") : t("refresh"),
								},
								h(RefreshIcon, { spinning: busy }),
								h("span", {}, busy ? t("refreshing") : t("refresh")),
							),
						),
					),
					errorMessage === null
						? null
						: h(
								"div",
								{ className: "dsh-weekly-banner" },
								h("span", { className: "dsh-weekly-banner-text", role: "status" }, errorMessage),
								h(
									"button",
									{ type: "button", className: "dsh-weekly-btn", onClick: () => void load(), disabled: busy },
									t("retry"),
								),
							),
					h(
						"div",
						{ className: "dsh-weekly-stats" },
						stats.map((stat) =>
							h(StatCard, {
								key: stat.key,
								label: stat.label,
								value: stat.value,
								previous: stat.previous,
								unit: stat.unit,
								compare,
								t,
							}),
						),
					),
					h(
						"div",
						{ className: "dsh-weekly-status" },
						statuses.map((item) => {
							const delta = deltaOf(item.value, item.previous);
							return h(
								"div",
								{ key: item.key, className: "dsh-weekly-status-item" },
								h("span", { className: "dsh-weekly-status-dot is-" + item.key }),
								h("span", { className: "dsh-weekly-status-name" }, item.label),
								h("span", { className: "dsh-weekly-status-value" }, valueText(item.value)),
								delta === null ? null : h("span", { className: "dsh-weekly-status-delta" }, delta.text),
							);
						}),
					),
					h(
						"div",
						{ className: "dsh-weekly-grid" },
						h(CompletedList, { data, t }),
						h(ActivityChart, { data, t }),
					),
				),
			);
		}

		// ------------------------------------------------------------------
		// Cordis plugin entry of the browser half.
		// ------------------------------------------------------------------
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), "dsh-weekly-snapshot: dictionaries");
			ctx.effect(() => injectStyles(), "dsh-weekly-snapshot: styles");
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{ name: "sidebar.panellist", id: PANEL_ID, order: 2, label: () => t("panel"), locale: NS },
					WeeklyIcon,
				),
			);
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{ name: "main", key: PANEL_ID, locale: NS },
					(props) => h(WeeklyPage, { ...props, t }),
				),
			);
			// Leaving this page selected after unload would strand the centre
			// column on a main key that no longer exists. Return to the
			// conversation only while this plugin's own panel is selected.
			ctx.effect(
				() => () => {
					try {
						const panelInfo = ctx.layout.panelInfo;
						const info = typeof panelInfo.getSnapshot === "function" ? panelInfo.getSnapshot() : null;
						if (info !== null && info.activePanelId === PANEL_ID) ctx.layout.selectPanel(null);
					} catch {
						// The layout service may already be gone during page teardown.
					}
				},
				"dsh-weekly-snapshot: leave page on dispose",
			);
		}

		return { inject: ["slots", "locale", "layout"], apply, __internals: { WeeklyPage, normalizePayload, deltaOf, WeeklyIcon } };
	},
});
