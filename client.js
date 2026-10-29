window.__ModuleLoader__.load({
	id: "dsh-live",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;
		const NS = "dshLive";
		const LIVE_ID = "dsh-live";
		const LIVE_KIND = "live";

		const en = {
			"type.label": "Live",
			"guide.title": "Live cockpit",
			"guide.description": "What this session is doing right now.",
			"empty": "Nothing is running in this session right now.",
			"phase.llm": "Thinking",
			"phase.tool": "Running a tool",
			"phase.waiting": "Waiting for you",
			"phase.idle": "Idle",
			"turn": "Turn {n}",
			"step": "step {n}",
			"elapsed": "{s}s",
			"tools": "Running tool",
			"noTools": "No tool is running.",
			"approvals": "Needs your attention",
			"jobs": "Background jobs",
			"spend": "Tokens",
			"errors": "Errors",
			"recent": "Recently finished",
			"noProjection": "Live data is unavailable in this panel.",
			"unsupported": "This panel needs the session projection seat."
		};
		const zh = {
			"type.label": "现场",
			"guide.title": "现场驾驶舱",
			"guide.description": "这个会话此刻正在做什么。",
			"empty": "这个会话现在没有在运行的东西。",
			"phase.llm": "思考中",
			"phase.tool": "正在执行工具",
			"phase.waiting": "等你处理",
			"phase.idle": "空闲",
			"turn": "第 {n} 轮",
			"step": "第 {n} 步",
			"elapsed": "{s} 秒",
			"tools": "运行中的工具",
			"noTools": "没有工具在运行。",
			"approvals": "需要你处理",
			"jobs": "后台任务",
			"spend": "Token",
			"errors": "错误",
			"recent": "刚完成的",
			"noProjection": "此面板拿不到实时数据。",
			"unsupported": "此面板需要会话投影席位。"
		};

		const color = {
			label: "var(--dsw-alias-label-primary, #1f2328)",
			secondary: "var(--dsw-alias-label-secondary, #6b7280)",
			tertiary: "var(--dsw-alias-label-tertiary, #9aa1ab)",
			border: "var(--dsw-alias-border-l1, rgba(0,0,0,0.08))",
			warn: "var(--dsw-alias-label-warning, #b45309)",
			accent: "var(--dsw-alias-label-accent, #2563eb)",
			ok: "var(--dsw-alias-label-success, #15803d)",
			bad: "var(--dsw-alias-label-danger, #b91c1c)"
		};

		const row = {
			display: "flex",
			alignItems: "baseline",
			gap: "6px",
			fontSize: "12px",
			lineHeight: "18px"
		};

		function Glyph({ size = 14 }) {
			return h(
				"svg",
				{ width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
				h("circle", { cx: 8, cy: 8, r: 6.2, stroke: "currentColor", strokeWidth: 1.3 }),
				h("circle", { cx: 8, cy: 8, r: 2.1, fill: "currentColor" }),
				h("path", {
					d: "M8 1.8v2.1M8 12.1v2.1M1.8 8h2.1M12.1 8h2.1",
					stroke: "currentColor",
					strokeWidth: 1.3,
					strokeLinecap: "round"
				})
			);
		}

		function seconds(since, now) {
			if (typeof since !== "number" || since <= 0) return null;
			return Math.max(0, Math.round((now - since) / 1000));
		}

		function phaseLabel(phase, t) {
			if (phase === "tool") return t("phase.tool");
			if (phase === "waiting") return t("phase.waiting");
			if (phase === "llm") return t("phase.llm");
			return t("phase.idle");
		}

		function Section({ title, children }) {
			return h(
				"section",
				{ style: { display: "flex", flexDirection: "column", gap: "4px" } },
				h(
					"div",
					{
						style: {
							fontSize: "11px",
							letterSpacing: "0.04em",
							textTransform: "uppercase",
							color: color.tertiary
						}
					},
					title
				),
				children
			);
		}

		function LiveBody(props) {
			const t = typeof props.t === "function" ? props.t : (key) => key;
			const useTabInfo = props.useTabInfo;
			const tabInfo = typeof useTabInfo === "function" ? useTabInfo() : undefined;
			const useProjection = props.useProjection;
			const live = typeof useProjection === "function" ? useProjection("live") : undefined;
			const [now, setNow] = React.useState(() => Date.now());

			React.useEffect(() => {
				const timer = setInterval(() => setNow(Date.now()), 1000);
				return () => clearInterval(timer);
			}, []);

			if (typeof useProjection !== "function") {
				return h(
					"div",
					{ style: { padding: "12px", fontSize: "12px", color: color.secondary }, "data-dsh-live": "unsupported" },
					t("unsupported")
				);
			}
			if (live === undefined || live === null) {
				return h(
					"div",
					{ style: { padding: "12px", fontSize: "12px", color: color.secondary }, "data-dsh-live": "empty" },
					t("empty")
				);
			}

			const phase = typeof live.phase === "string" ? live.phase : "idle";
			const turn = typeof live.turn === "number" ? live.turn : null;
			const step = typeof live.step === "number" ? live.step : null;
			const turnSeconds = seconds(live.turnStartedAt, now);
			const toolSeconds = seconds(live.tool && live.tool.startedAt, now);
			const pending = Array.isArray(live.pending) ? live.pending : [];
			const jobs = Array.isArray(live.jobs) ? live.jobs : [];
			const recent = Array.isArray(live.recent) ? live.recent : [];
			const tokensIn = typeof live.tokensIn === "number" ? live.tokensIn : 0;
			const tokensOut = typeof live.tokensOut === "number" ? live.tokensOut : 0;
			const errors = typeof live.errors === "number" ? live.errors : 0;

			const phaseColor = phase === "waiting" ? color.warn : phase === "idle" ? color.tertiary : color.accent;
			const meta = [];
			if (turn !== null) meta.push(t("turn", { n: turn }));
			if (step !== null) meta.push(t("step", { n: step }));
			if (turnSeconds !== null) meta.push(t("elapsed", { s: turnSeconds }));

			const children = [];
			children.push(
				h(
					"div",
					{ key: "head", style: { display: "flex", flexDirection: "column", gap: "2px" } },
					h(
						"div",
						{ style: { ...row, fontWeight: 600, color: phaseColor } },
						h("span", { style: { display: "inline-flex", alignItems: "center" } }, h(Glyph, { size: 13 })),
						h("span", null, phaseLabel(phase, t))
					),
					meta.length > 0
						? h("div", { style: { ...row, color: color.secondary } }, meta.join(" · "))
						: null
				)
			);

			children.push(
				h(
					Section,
					{ key: "tool", title: t("tools") },
					live.tool
						? h(
								"div",
								{ style: { ...row, color: color.label, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } },
								h("span", { style: { color: color.accent } }, live.tool.name),
								toolSeconds !== null ? h("span", { style: { color: color.tertiary } }, t("elapsed", { s: toolSeconds })) : null
							)
						: h("div", { style: { ...row, color: color.tertiary } }, t("noTools"))
				)
			);

			if (pending.length > 0) {
				children.push(
					h(
						Section,
						{ key: "pending", title: t("approvals") },
						pending.map((item, index) =>
							h(
								"div",
								{ key: "p" + index, style: { ...row, color: color.warn } },
								h("span", null, String(item && item.title ? item.title : "approval")),
								seconds(item && item.since, now) !== null
									? h("span", { style: { color: color.tertiary } }, t("elapsed", { s: seconds(item.since, now) }))
									: null
							)
						)
					)
				);
			}

			if (jobs.length > 0) {
				children.push(
					h(
						Section,
						{ key: "jobs", title: t("jobs") },
						jobs.map((job, index) =>
							h(
								"div",
								{ key: "j" + index, style: { ...row, color: color.label } },
								h("span", null, String(job && job.label ? job.label : "job")),
								seconds(job && job.startedAt, now) !== null
									? h("span", { style: { color: color.tertiary } }, t("elapsed", { s: seconds(job.startedAt, now) }))
									: null
							)
						)
					)
				);
			}

			children.push(
				h(
					Section,
					{ key: "spend", title: t("spend") },
					h(
						"div",
						{ style: { ...row, color: color.secondary } },
						h("span", null, "↑ " + tokensIn),
						h("span", { style: { color: color.tertiary } }, "·"),
						h("span", null, "↓ " + tokensOut),
						errors > 0 ? h("span", { style: { color: color.bad } }, "· " + t("errors") + " " + errors) : null
					)
				)
			);

			if (recent.length > 0) {
				children.push(
					h(
						Section,
						{ key: "recent", title: t("recent") },
						recent.map((item, index) =>
							h(
								"div",
								{ key: "r" + index, style: { ...row, color: color.secondary } },
								h("span", { style: { color: item && item.ok === false ? color.bad : color.ok } }, item && item.ok === false ? "✕" : "✓"),
								h("span", { style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }, String(item && item.name ? item.name : "tool")),
								h("span", { style: { color: color.tertiary } }, String(typeof item?.ms === "number" ? Math.round(item.ms) + "ms" : ""))
							)
						)
					)
				);
			}

			return h(
				"div",
				{
					"data-dsh-live": "body",
					"data-tab-id": tabInfo && tabInfo.tab ? tabInfo.tab.id : undefined,
					style: {
						display: "flex",
						flexDirection: "column",
						gap: "12px",
						padding: "12px",
						fontSize: "12px",
						color: color.label,
						overflowY: "auto"
					}
				},
				children
			);
		}

		function LiveTitle({ useTabInfo }) {
			const info = typeof useTabInfo === "function" ? useTabInfo() : undefined;
			const title = info && info.tab ? info.tab.title : "Live";
			return h(
				"span",
				{ style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
				h(Glyph, { size: 12 }),
				h("span", null, typeof title === "string" ? title : "Live")
			);
		}

		function liveDefinition(t) {
			return {
				id: LIVE_ID,
				kind: LIVE_KIND,
				priority: "extension",
				title: () => t("type.label"),
				guide: [
					{
						id: LIVE_KIND,
						order: 5,
						title: () => t("guide.title"),
						description: () => t("guide.description"),
						icon: (props) => h(Glyph, { size: (props && props.size) || 22 })
					}
				]
			};
		}

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { en, zh }), "dsh-live: dictionaries");
			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.pane.tab", () =>
						ctx.slots.register(
							{
								name: "sidebar.right.pane.tab",
								key: LIVE_ID,
								locale: NS
							},
							LiveBody
						)
					),
				"dsh-live: live tab body"
			);
			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.pane.tab.title", () =>
						ctx.slots.register(
							{
								name: "sidebar.right.pane.tab.title",
								key: LIVE_ID
							},
							LiveTitle
						)
					),
				"dsh-live: live tab title"
			);
			ctx.effect(() => ctx.sidebarRightTabs.register(liveDefinition(t)), "dsh-live: live type");
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "sidebarRightTabs"];
		return module.exports;
	}
});
