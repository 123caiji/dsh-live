import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../client.js", import.meta.url), "utf8")
	.replace("exports.apply = apply;", "exports.apply = apply; exports.__test = { LiveBody, LiveTitle, en, zh };");

const React = {
	createElement(type, props, ...children) {
		const kids = children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
		return { type, props: { ...(props || {}), children: kids } };
	},
	Fragment: Symbol.for("Fragment"),
	useState: (init) => [typeof init === "function" ? init() : init, () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
	useRef: (init) => ({ current: init }),
	useCallback: (fn) => fn
};

function render(node) {
	if (node === null || node === undefined || node === false || node === true) return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(render).join("");
	const { type, props } = node;
	if (typeof type === "function") return render(type(props));
	const attrs = Object.entries(props)
		.filter(([k, v]) => k.startsWith("data-") && typeof v === "string")
		.map(([k, v]) => " " + k + '="' + v + '"')
		.join("");
	const inner = render(props.children);
	return "<" + type + attrs + ">" + inner + "</" + type + ">";
}

let captured = null;
const sandbox = { window: { __ModuleLoader__: { load: (m) => { captured = m; } } }, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "client.js" }).runInContext(sandbox);
const mod = captured.factory(() => React);
const { LiveBody, LiveTitle, en } = mod.__test;

const t = (key, vars) => {
	const template = typeof en[key] === "string" ? en[key] : key;
	return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) : template;
};
const tabInfo = () => ({ tab: { id: "t1", title: "现场" } });

// 1. seat without useProjection -> graceful unsupported notice
const unsupported = render(LiveBody({ useTabInfo: tabInfo, t }));
assert.match(unsupported, /data-dsh-live="unsupported"/);
assert.match(unsupported, /needs the session projection seat/);

// 2. useProjection present but no value -> empty state
const empty = render(LiveBody({ useTabInfo: tabInfo, t, useProjection: () => undefined }));
assert.match(empty, /data-dsh-live="empty"/);

// 3. a real live view: busy turn with tool, approval, job, tokens, error and history
const live = {
	phase: "tool",
	turn: 3,
	step: 2,
	turnStartedAt: Date.now() - 5000,
	stepStartedAt: Date.now() - 2000,
	tool: { name: "bash", startedAt: Date.now() - 1500 },
	pending: [{ id: "a1", title: "Allow write" }],
	jobs: [{ id: "j1", label: "dev server", startedAt: Date.now() - 9000 }],
	tokensIn: 1234,
	tokensOut: 567,
	errors: 2,
	lastError: "rate limited",
	recent: [{ name: "read", ok: true, ms: 250 }, { name: "write", ok: false, ms: 40 }]
};
const html = render(LiveBody({ useTabInfo: tabInfo, t, useProjection: (id) => (id === "live" ? live : undefined) }));
assert.match(html, /data-dsh-live="body"/);
assert.match(html, /data-tab-id="t1"/);
assert.match(html, /Running a tool/);
assert.match(html, /Turn 3/);
assert.match(html, /step 2/);
assert.match(html, /bash/);
assert.match(html, /Needs your attention/);
assert.match(html, /Allow write/);
assert.match(html, /Background jobs/);
assert.match(html, /dev server/);
assert.match(html, /↑ 1234/);
assert.match(html, /↓ 567/);
assert.match(html, /Errors 2/);
assert.match(html, /Recently finished/);
assert.match(html, /250ms/);
assert.match(html, /✕/);

// 4. idle session hides the approval/job/history sections entirely
const idle = render(LiveBody({ useTabInfo: tabInfo, t, useProjection: () => ({ ...live, phase: "idle", tool: null, pending: [], jobs: [], recent: [] }) }));
assert.match(idle, /Idle/);
assert.doesNotMatch(idle, /Needs your attention/);
assert.doesNotMatch(idle, /Recently finished/);
assert.match(idle, /No tool is running/);

// 5. the title chip
const title = render(LiveTitle({ useTabInfo: tabInfo }));
assert.match(title, /现场/);
console.log("render OK: unsupported/empty/busy/idle states + title chip, " + html.length + " chars of markup");
