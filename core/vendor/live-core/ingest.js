// @ts-nocheck
import { categorize, clip, firstLine, isHumanPrompt, toolDetail, toolLabel, toolName } from "./categorize.js";
export const HISTORY_MS = 6 * 3_600_000;
const MAX_SPANS = 1_500;
const MAX_MARKS = 200;
const MSG_TOKEN_KEYS = 400;
function obj(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
}
function str(v) {
    return typeof v === "string" ? v : "";
}
function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function parseTs(v) {
    if (typeof v !== "string")
        return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
}
export function contextTokensOf(usage) {
    if (!usage)
        return 0;
    const sum = (u) => (num(u?.input_tokens) ?? 0) + (num(u?.cache_read_input_tokens) ?? 0) + (num(u?.cache_creation_input_tokens) ?? 0);
    const iters = usage.iterations;
    if (Array.isArray(iters)) {
        for (let i = iters.length - 1; i >= 0; i--) {
            const it = obj(iters[i]);
            if (it && it.type === "message")
                return sum(it);
        }
    }
    return sum(usage);
}
export function parseCompaction(r) {
    if (r.type !== "system" || r.subtype !== "compact_boundary")
        return null;
    const ts = parseTs(r.timestamp);
    if (ts === null)
        return null;
    const m = obj(r.compactMetadata);
    return {
        ts,
        trigger: str(m?.trigger) || "unknown",
        preTokens: num(m?.preTokens),
        postTokens: num(m?.postTokens),
        durationMs: num(m?.durationMs),
    };
}
export class TranscriptModel {
    kind;
    spans = [];
    pending = new Map();
    curThink = null;
    genStart = null;
    seq = 0;
    compactions = [];
    errors = [];
    spawns = new Map();
    messages = new Map();
    buckets = new Map();
    msgTokens = new Map();
    classCounts = {};
    title = "";
    lastPrompt = "";
    lastText = "";
    model = "";
    contextTokens = 0;
    firstTs = null;
    lastTs = null;
    turnEnded = false;
    endAt = null;
    prompts = 0;
    calls = 0;
    constructor(kind) {
        this.kind = kind;
    }
    reset() {
        this.spans = [];
        this.pending.clear();
        this.curThink = null;
        this.genStart = null;
        this.compactions = [];
        this.errors = [];
        this.spawns.clear();
        this.messages.clear();
        this.buckets.clear();
        this.msgTokens.clear();
        this.classCounts = {};
        this.title = "";
        this.lastPrompt = "";
        this.lastText = "";
        this.model = "";
        this.contextTokens = 0;
        this.firstTs = null;
        this.lastTs = null;
        this.turnEnded = false;
        this.endAt = null;
        this.prompts = 0;
        this.calls = 0;
    }
    ingestLine(line) {
        if (line.length < 2)
            return;
        let r;
        try {
            r = JSON.parse(line);
        }
        catch {
            return;
        }
        const rec = obj(r);
        if (rec)
            this.ingest(rec);
    }
    ingest(r) {
        const ts = parseTs(r.timestamp);
        if (ts !== null) {
            if (this.firstTs === null || ts < this.firstTs)
                this.firstTs = ts;
            if (this.lastTs === null || ts > this.lastTs)
                this.lastTs = ts;
        }
        switch (r.type) {
            case "ai-title":
                if (str(r.aiTitle))
                    this.title = str(r.aiTitle);
                return;
            case "last-prompt":
                if (this.kind === "main" && str(r.lastPrompt))
                    this.lastPrompt = clip(r.lastPrompt, 400);
                return;
            case "system":
                this.onSystem(r);
                return;
            case "user":
                if (ts !== null)
                    this.onUser(r, ts);
                return;
            case "assistant":
                if (ts !== null)
                    this.onAssistant(r, ts);
                return;
        }
    }
    push(span) {
        this.spans.push(span);
        if (this.spans.length > MAX_SPANS)
            this.spans.splice(0, this.spans.length - MAX_SPANS);
        return span;
    }
    newSpan(c, s, e, tool, label, detail, id) {
        return { id: id || `${this.kind}#${++this.seq}`, c, s, e, open: e === null, tool, label, detail, err: false, interrupted: false };
    }
    bucket(ts) {
        const minute = Math.floor(ts / 60_000);
        let b = this.buckets.get(minute);
        if (!b) {
            b = { minute, outTokens: 0, tools: 0 };
            this.buckets.set(minute, b);
        }
        return b;
    }
    closeThink(ts) {
        if (this.curThink) {
            this.curThink.e = Math.max(this.curThink.s, ts);
            this.curThink.open = false;
            this.curThink = null;
        }
    }
    closePending(ts) {
        for (const span of this.pending.values()) {
            span.e = Math.max(span.s, ts);
            span.open = false;
            span.interrupted = true;
        }
        this.pending.clear();
    }
    turnStart(ts) {
        this.turnEnded = false;
        this.endAt = null;
        this.closeThink(ts);
        this.closePending(ts);
        this.genStart = ts;
    }
    onSystem(r) {
        const c = parseCompaction(r);
        if (c) {
            this.compactions.push(c);
            if (this.compactions.length > MAX_MARKS)
                this.compactions.shift();
        }
    }
    onUser(r, ts) {
        if (r.isMeta === true)
            return;
        if (r.isCompactSummary === true) {
            this.closeThink(ts);
            this.genStart = ts;
            return;
        }
        const msg = obj(r.message);
        const content = msg?.content;
        const blocks = Array.isArray(content) ? content.map(obj).filter((b) => b !== null) : [];
        const hasResult = blocks.some(b => b.type === "tool_result");
        if (typeof content === "string" || (!hasResult && blocks.some(b => b.type === "text"))) {
            const text = typeof content === "string" ? content : blocks.filter(b => b.type === "text").map(b => str(b.text)).join("\n");
            if (/^\[Request interrupted/.test(text)) {
                this.closeThink(ts);
                this.closePending(ts);
                this.genStart = null;
                return;
            }
            this.turnStart(ts);
            if (isHumanPrompt(text)) {
                this.prompts++;
                if (this.kind === "main" || !this.lastPrompt)
                    this.lastPrompt = clip(firstLine(text) || text, 400);
            }
            return;
        }
        if (!hasResult)
            return;
        const tur = obj(r.toolUseResult);
        for (const b of blocks) {
            if (b.type !== "tool_result")
                continue;
            const id = str(b.tool_use_id);
            const span = this.pending.get(id);
            if (span) {
                span.e = Math.max(span.s, ts);
                span.open = false;
                if (b.is_error === true) {
                    span.err = true;
                    this.errors.push({ ts, tool: span.tool, label: span.label });
                    if (this.errors.length > MAX_MARKS)
                        this.errors.shift();
                }
                if (tur?.interrupted === true)
                    span.interrupted = true;
                this.pending.delete(id);
            }
            const spawn = this.spawns.get(id);
            if (spawn && tur && str(tur.agentId))
                spawn.agentId = str(tur.agentId);
            const message = this.messages.get(id);
            if (message)
                message.ok = tur ? tur.success === true : b.is_error !== true;
        }
        this.genStart = ts;
    }
    onAssistant(r, ts) {
        const msg = obj(r.message);
        if (!msg)
            return;
        const model = str(msg.model);
        if (model && model !== "<synthetic>")
            this.model = model;
        const usage = obj(msg.usage);
        if (usage) {
            const out = num(usage.output_tokens) ?? 0;
            const id = str(msg.id);
            const prev = this.msgTokens.get(id) ?? 0;
            if (out > prev) {
                this.msgTokens.set(id, out);
                this.bucket(ts).outTokens += out - prev;
                if (this.msgTokens.size > MSG_TOKEN_KEYS)
                    this.msgTokens.delete(this.msgTokens.keys().next().value);
            }
            const ctx = contextTokensOf(usage);
            if (ctx > 0)
                this.contextTokens = ctx;
        }
        if (this.genStart !== null) {
            if (!this.curThink)
                this.curThink = this.push(this.newSpan("think", this.genStart, ts, "Model", "Thinking", ""));
            else
                this.curThink.e = ts;
            this.curThink.open = true;
        }
        let sawTool = false;
        const content = Array.isArray(msg.content) ? msg.content : [];
        for (const raw of content) {
            const b = obj(raw);
            if (!b)
                continue;
            if (b.type === "thinking" && str(b.thinking) && this.curThink) {
                this.curThink.label = clip(b.thinking, 120);
            }
            else if (b.type === "text" && str(b.text).trim()) {
                this.lastText = clip(b.text, 700);
            }
            else if (b.type === "tool_use") {
                sawTool = true;
                const name = str(b.name) || "?";
                const input = obj(b.input);
                const id = str(b.id);
                const c = categorize(name, input);
                const span = this.push(this.newSpan(c, ts, null, toolName(name), clip(toolLabel(name, input), 110), toolDetail(input), id || undefined));
                this.pending.set(span.id, span);
                this.classCounts[c] = (this.classCounts[c] ?? 0) + 1;
                this.calls++;
                this.bucket(ts).tools++;
                if (name === "Agent" || name === "Task") {
                    this.spawns.set(span.id, {
                        toolUseId: span.id,
                        at: ts,
                        description: str(input?.description),
                        agentType: str(input?.subagent_type) || "general-purpose",
                        agentId: null,
                        background: input?.run_in_background === true || input?.run_in_background === "true",
                    });
                }
                else if (name === "SendMessage") {
                    this.messages.set(span.id, { toolUseId: span.id, at: ts, to: str(input?.to) || str(input?.recipient), summary: clip(input?.summary, 160), ok: null });
                }
            }
        }
        if (sawTool) {
            this.closeThink(ts);
            this.genStart = null;
        }
        const stop = msg.stop_reason;
        if (stop === "end_turn" || stop === "stop_sequence") {
            this.closeThink(ts);
            this.genStart = null;
            this.turnEnded = true;
            this.endAt = ts;
        }
    }
    prune(cut) {
        const keep = (s) => s.open || (s.e ?? s.s) >= cut;
        if (this.spans.length && !keep(this.spans[0]))
            this.spans = this.spans.filter(keep);
        this.compactions = this.compactions.filter(c => c.ts >= cut);
        this.errors = this.errors.filter(e => e.ts >= cut);
        for (const [k, v] of this.spawns)
            if (v.at < cut && !this.pending.has(k))
                this.spawns.delete(k);
        for (const [k, v] of this.messages)
            if (v.at < cut)
                this.messages.delete(k);
        const cutMinute = Math.floor(cut / 60_000);
        for (const k of this.buckets.keys())
            if (k < cutMinute)
                this.buckets.delete(k);
    }
    summary() {
        const pending = [...this.pending.values()].sort((a, b) => b.s - a.s);
        return {
            kind: this.kind,
            title: this.title,
            lastPrompt: this.lastPrompt,
            lastText: this.lastText,
            model: this.model,
            contextTokens: this.contextTokens,
            firstTs: this.firstTs,
            lastTs: this.lastTs,
            historyFrom: this.firstTs,
            turnEnded: this.turnEnded,
            endAt: this.endAt,
            genStart: this.genStart,
            openTool: pending[0] ? { ...pending[0] } : null,
            spans: this.spans.map(s => ({ ...s })),
            compactions: this.compactions.map(c => ({ ...c })),
            errors: this.errors.map(e => ({ ...e })),
            spawns: [...this.spawns.values()].map(s => ({ ...s })),
            messages: [...this.messages.values()].map(m => ({ ...m })),
            buckets: [...this.buckets.values()].sort((a, b) => a.minute - b.minute).map(b => ({ ...b })),
            classCounts: { ...this.classCounts },
            prompts: this.prompts,
            calls: this.calls,
        };
    }
}
