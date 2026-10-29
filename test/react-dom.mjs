import fs from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "http://127.0.0.1/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");

let captured = null;
globalThis.window.__ModuleLoader__ = { load: (mod) => { captured = mod; } };
const source = fs.readFileSync(new URL("../client.js", import.meta.url), "utf8")
	.replace("exports.apply = apply;", "exports.apply = apply; exports.__test = { LiveBody, LiveTitle, en };");
// Evaluate the bundle as a classic script so its top-level window.__ModuleLoader__ call runs.
new Function(source)();
assert.ok(captured, "loader called");
const mod = captured.factory((name) => {
	if (name === "react") return React;
	throw new Error("unexpected require: " + name);
});
const { LiveBody, LiveTitle, en } = mod.__test;
const t = (key, vars) => {
	const template = typeof en[key] === "string" ? en[key] : key;
	return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) : template;
};

const container = document.getElementById("root");
const root = createRoot(container);
const now = Date.now();
const live = {
	phase: "tool", turn: 3, step: 2,
	turnStartedAt: now - 5000, stepStartedAt: now - 2000,
	tool: { name: "bash", startedAt: now - 1500 },
	pending: [{ id: "a1", title: "Allow write" }],
	jobs: [{ id: "j1", label: "dev server", startedAt: now - 9000 }],
	tokensIn: 1234, tokensOut: 567, errors: 2, lastError: "rate limited",
	recent: [{ name: "read", ok: true, ms: 250 }, { name: "write", ok: false, ms: 40 }]
};
const props = {
	t,
	useTabInfo: () => ({ tab: { id: "tab-1", title: "现场" } }),
	useProjection: (id) => (id === "live" ? live : undefined)
};
await React.act(async () => { root.render(React.createElement(LiveBody, props)); });
const html = container.innerHTML;
const text = container.textContent;
for (const expected of ["Running a tool", "Turn 3", "step 2", "bash", "Needs your attention", "Allow write", "Background jobs", "dev server", "↑ 1234", "↓ 567", "Errors 2", "Recently finished", "250ms"]) {
	assert.ok(text.includes(expected), "panel should show: " + expected);
}
assert.match(html, /data-dsh-live="body"/);
assert.match(html, /data-tab-id="tab-1"/);

// the elapsed clock ticks on its own: wait one interval and read a larger second count
const before = (text.match(/(\d+)s/) || [])[1];
await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1200)); });
const after = (container.textContent.match(/(\d+)s/) || [])[1];
assert.ok(Number(after) >= Number(before), "elapsed should not go backwards: " + before + " -> " + after);
assert.notEqual(after, before, "the panel should re-render every second while a turn is open");

// idle shape hides the conditional sections
await React.act(async () => {
	root.render(React.createElement(LiveBody, { ...props, useProjection: () => ({ ...live, phase: "idle", tool: null, pending: [], jobs: [], recent: [] }) }));
});
assert.ok(container.textContent.includes("Idle"));
assert.ok(!container.textContent.includes("Needs your attention"));
assert.ok(container.textContent.includes("No tool is running"));

// title chip
await React.act(async () => { root.render(React.createElement(LiveTitle, { useTabInfo: () => ({ tab: { id: "tab-1", title: "现场" } }) })); });
assert.ok(container.textContent.includes("现场"));

await React.act(async () => { root.unmount(); });
console.log("react-dom OK: real React 19 mount, markup checks, live 1s tick (" + before + "s -> " + after + "s), idle shape, title chip");
