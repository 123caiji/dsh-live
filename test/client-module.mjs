import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const src = fs.readFileSync(new URL("../client.js", import.meta.url), "utf8");
let captured = null;
const fakeReact = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (init) => [typeof init === "function" ? init() : init, () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
	memo: (c) => c
};
const sandbox = {
	window: { __ModuleLoader__: { load: (mod) => { captured = mod; } } },
	console,
	require: undefined
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(src, { filename: "client.js" }).runInContext(sandbox);
assert.ok(captured, "module loader must be called");
assert.equal(captured.id, "dsh-live");
const out = captured.factory((name) => {
	if (name === "react") return fakeReact;
	throw new Error("unexpected require: " + name);
});
assert.deepEqual([...out.inject].sort(), ["locale", "sidebarRightTabs", "slots"]);

const calls = { locale: 0, slotInject: [], tabs: [], effects: 0 };
const disposer = () => {};
const ctx = {
	effect: (fn, label) => { calls.effects++; const d = fn(); return d ?? disposer; },
	locale: {
		bind: () => (key, vars) => key + (vars ? JSON.stringify(vars) : ""),
		register: () => { calls.locale++; return disposer; }
	},
	slots: {
		inject: (owner, fn) => { calls.slotInject.push(owner); return fn(); },
		register: (options, component) => { calls.slotInject.push(options.name + ":" + options.key); return disposer; }
	},
	sidebarRightTabs: { register: (definition) => { calls.tabs.push(definition); return disposer; } }
};
out.apply(ctx);

assert.equal(calls.locale, 1, "dictionaries registered once");
assert.deepEqual(calls.slotInject.filter((x) => x.includes(":")), ["sidebar.right.pane.tab:dsh-live", "sidebar.right.pane.tab.title:dsh-live"]);
assert.equal(calls.tabs.length, 1);
const definition = calls.tabs[0];
assert.equal(definition.id, "dsh-live");
assert.equal(definition.kind, "live");
assert.equal(definition.priority, "extension");
assert.equal(definition.guide.length, 1);
for (const field of ["id", "order", "title", "description", "icon"]) assert.ok(field in definition.guide[0], "guide needs " + field);
assert.equal(typeof definition.title(), "string");
assert.equal(typeof definition.guide[0].title(), "string");
console.log("client module OK: loader id, inject set, 4 registrations, guide entry fields:", Object.keys(definition.guide[0]).join(","));
