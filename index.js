/**
 * dsh-live — host half.
 *
 * Registers one session projection (`live`) that folds the committed session
 * event log into the small amount of state a cockpit panel needs: which turn
 * and step is open, which tool is running right now, what the session is
 * waiting on, which background jobs are alive, and how much has been spent so
 * far. The fold is pure, synchronous, and returns the same state reference for
 * events it does not own, so unrelated traffic costs nothing downstream.
 *
 * @module dsh-live
 */

/** Raised when a projection value does not match the unit's wire shape. */
class LiveShapeError extends TypeError {}

const text = (value) => {
	if (typeof value === "string") return value;
	if (value === undefined || value === null) return "";
	try {
		return String(value);
	} catch {
		return "";
	}
};

/** One-line, length-capped label: job labels carry whole shell commands. */
const headline = (value, fallback, limit = 48) => {
	const raw = text(value);
	const firstLine = raw.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
	const flat = firstLine.replace(/\s+/g, " ").trim();
	if (flat === "") return fallback;
	return flat.length > limit ? flat.slice(0, limit - 1).trimEnd() + "…" : flat;
};

const count = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
const when = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

const PHASES = new Set(["idle", "llm", "tool", "waiting"]);

/**
 * Build a schema object with the single method the projection registry calls.
 * @param {(value: unknown) => unknown} read normalizes or throws LiveShapeError.
 * @returns {{ parse: (value: unknown) => unknown }} a detached-value parser.
 */
const schema = (read) => ({
	parse: (value) => {
		try {
			return read(value);
		} catch (error) {
			if (error instanceof LiveShapeError) throw error;
			throw new LiveShapeError(String(error));
		}
	}
});

const record = (value, field) => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new LiveShapeError(field + " must be an object");
	}
	return value;
};

const list = (value, field) => {
	if (!Array.isArray(value)) throw new LiveShapeError(field + " must be an array");
	return value;
};

const readTool = (value) => {
	if (value === null) return null;
	const node = record(value, "tool");
	return { callId: text(node.callId), name: text(node.name) || "tool", startedAt: when(node.startedAt) ?? 0 };
};

const readPending = (value) => {
	const node = record(value, "pending[]");
	return { id: text(node.id), title: text(node.title) || "approval", since: when(node.since) ?? 0 };
};

const readJob = (value) => {
	const node = record(value, "jobs[]");
	return { jobId: text(node.jobId), label: text(node.label) || "job", startedAt: when(node.startedAt) ?? 0 };
};

const readRecent = (value) => {
	const node = record(value, "recent[]");
	return { name: text(node.name) || "tool", ok: node.ok !== false, ms: count(node.ms) };
};

/** The `live` unit's state and wire shape: one plain JSON object. */
const liveSchema = schema((value) => {
	const node = record(value, "live");
	const phase = text(node.phase);
	return {
		turn: when(node.turn),
		step: when(node.step),
		phase: PHASES.has(phase) ? phase : "idle",
		turnStartedAt: when(node.turnStartedAt),
		stepStartedAt: when(node.stepStartedAt),
		tool: readTool(node.tool ?? null),
		pending: list(node.pending ?? [], "pending").map(readPending),
		jobs: list(node.jobs ?? [], "jobs").map(readJob),
		tokensIn: count(node.tokensIn),
		tokensOut: count(node.tokensOut),
		errors: count(node.errors),
		lastError: typeof node.lastError === "string" ? node.lastError : null,
		recent: list(node.recent ?? [], "recent").map(readRecent).slice(0, 5)
	};
});

const EMPTY = liveSchema.parse({
	turn: null,
	step: null,
	phase: "idle",
	turnStartedAt: null,
	stepStartedAt: null,
	tool: null,
	pending: [],
	jobs: [],
	tokensIn: 0,
	tokensOut: 0,
	errors: 0,
	lastError: null,
	recent: []
});

const RECENT_LIMIT = 5;

const usageOf = (usage) => {
	if (typeof usage !== "object" || usage === null) return { input: 0, output: 0 };
	return { input: count(usage.inputTokens), output: count(usage.outputTokens) };
};

const backToWork = (state) => (state.phase === "idle" ? "llm" : state.phase);

export const liveProjectionDefinition = {
	key: "live",
	stateVersion: 1,
	stateSchema: liveSchema,
	init: () => EMPTY,
	apply: (state, event) => {
		const data = event.data ?? {};
		switch (event.type) {
			case "turn/start":
				return {
					...state,
					turn: when(data.turn),
					step: null,
					phase: "llm",
					turnStartedAt: event.time,
					stepStartedAt: null,
					tool: null
				};
			case "step/start":
				return {
					...state,
					turn: when(data.turn),
					step: when(data.step),
					phase: "llm",
					stepStartedAt: event.time,
					tool: null
				};
			case "assistant/message": {
				const usage = usageOf(data.usage);
				if (usage.input === 0 && usage.output === 0) return state;
				return {
					...state,
					tokensIn: state.tokensIn + usage.input,
					tokensOut: state.tokensOut + usage.output
				};
			}
			case "tool/call": {
				const callId = text(data.callId);
				if (callId === "") return state;
				return {
					...state,
					phase: "tool",
					tool: { callId, name: headline(data.name, "tool", 32), startedAt: event.time }
				};
			}
			case "tool/result": {
				const callId = text(data.message?.toolCallId ?? data.message?.source?.callId);
				const tool = state.tool;
				if (tool === null || callId === "" || tool.callId !== callId) return state;
				const recent = [
					{ name: tool.name, ok: data.message?.isError !== true, ms: Math.max(0, event.time - tool.startedAt) },
					...state.recent
				].slice(0, RECENT_LIMIT);
				return { ...state, phase: backToWork(state), tool: null, recent };
			}
			case "approval/asked": {
				const id = text(data.id);
				if (id === "" || state.pending.some((row) => row.id === id)) return state;
				return {
					...state,
					phase: "waiting",
					pending: [...state.pending, { id, title: headline(data.toolName, "approval", 32), since: event.time }]
				};
			}
			case "approval/decided": {
				const id = text(data.id);
				const pending = state.pending.filter((row) => row.id !== id);
				if (pending.length === state.pending.length) return state;
				return { ...state, phase: pending.length > 0 ? "waiting" : backToWork(state), pending };
			}
			case "job/registered": {
				const jobId = text(data.jobId);
				if (jobId === "" || state.jobs.some((row) => row.jobId === jobId)) return state;
				return {
					...state,
					jobs: [
						...state.jobs,
						{
							jobId,
							label: headline(data.label, headline(data.kind, "job", 24)),
							startedAt: when(data.startedAt) ?? event.time
						}
					]
				};
			}
			case "job/settled": {
				const jobId = text(data.jobId);
				const jobs = state.jobs.filter((row) => row.jobId !== jobId);
				return jobs.length === state.jobs.length ? state : { ...state, jobs };
			}
			case "llm/retry": {
				// One failure emits a sequence of retry events sharing a retryId:
				// the first carries retry 1, later ones are countdown updates.
				const failure = data.failure ?? {};
				const first = typeof data.retry === "number" ? data.retry <= 1 : true;
				return {
					...state,
					phase: "llm",
					errors: first ? state.errors + 1 : state.errors,
					lastError: text(failure.message) || text(failure.code) || "llm retry"
				};
			}
			case "llm/retry-started":
				return state.phase === "llm" ? state : { ...state, phase: "llm" };
			case "turn/end":
				return {
					...state,
					step: null,
					stepStartedAt: null,
					tool: null,
					pending: [],
					phase: "idle"
				};
			default:
				return state;
		}
	},
	wire: {
		viewSchema: liveSchema,
		view: (state) => liveSchema.parse(state)
	}
};

export const name = "dsh-live";

export const inject = ["sessionProjections"];

export function apply(ctx) {
	ctx.sessionProjections.register(liveProjectionDefinition);
}
