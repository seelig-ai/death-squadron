// @ts-nocheck
import { clip, isHumanPrompt, toolLabel, toolName } from "./categorize.js";
import { parseCompaction, parseTs } from "./ingest.js";
export const CHAT_TEXT_MAX = 4_000;
export const CHAT_DEFAULT_LIMIT = 80;
function obj(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
}
function str(v) {
    return typeof v === "string" ? v : "";
}
function cap(s) {
    const t = s.trim();
    return t.length > CHAT_TEXT_MAX ? t.slice(0, CHAT_TEXT_MAX - 1) + "…" : t;
}
export function chatItemsOf(r, seq) {
    const ts = parseTs(r.timestamp);
    if (ts === null)
        return [];
    const compaction = parseCompaction(r);
    if (compaction) {
        const tokens = compaction.preTokens !== null ? ` at ${compaction.preTokens} tokens` : "";
        return [{ id: str(r.uuid) || `c${seq()}`, kind: "compact", ts, text: `Context compacted (${compaction.trigger})${tokens}`, tool: null, err: false }];
    }
    if (r.isMeta === true || r.isCompactSummary === true)
        return [];
    const msg = obj(r.message);
    if (!msg)
        return [];
    const content = msg.content;
    if (r.type === "user") {
        if (typeof content === "string") {
            return isHumanPrompt(content) ? [{ id: str(r.uuid) || `u${seq()}`, kind: "user", ts, text: cap(content), tool: null, err: false }] : [];
        }
        if (!Array.isArray(content))
            return [];
        const blocks = content.map(obj).filter((b) => b !== null);
        if (blocks.some(b => b.type === "tool_result")) {
            const failed = blocks.filter(b => b.type === "tool_result" && b.is_error === true);
            return failed.map(b => ({ id: `${str(b.tool_use_id)}:err`, kind: "tool", ts, text: "Tool failed", tool: null, err: true }));
        }
        const text = blocks.filter(b => b.type === "text").map(b => str(b.text)).join("\n");
        return text && isHumanPrompt(text) ? [{ id: str(r.uuid) || `u${seq()}`, kind: "user", ts, text: cap(text), tool: null, err: false }] : [];
    }
    if (r.type !== "assistant" || !Array.isArray(content))
        return [];
    const out = [];
    for (const raw of content) {
        const b = obj(raw);
        if (!b)
            continue;
        if (b.type === "text" && str(b.text).trim()) {
            out.push({ id: `${str(r.uuid) || seq()}:t${out.length}`, kind: "assistant", ts, text: cap(str(b.text)), tool: null, err: false });
        }
        else if (b.type === "tool_use") {
            const name = str(b.name) || "?";
            out.push({ id: str(b.id) || `tu${seq()}`, kind: "tool", ts, text: clip(toolLabel(name, obj(b.input)), 160), tool: toolName(name), err: false });
        }
    }
    return out;
}
export function condenseChat(lines, limit = CHAT_DEFAULT_LIMIT) {
    let n = 0;
    const seq = () => ++n;
    const items = [];
    for (const line of lines) {
        if (line.length < 2)
            continue;
        let r;
        try {
            r = JSON.parse(line);
        }
        catch {
            continue;
        }
        const rec = obj(r);
        if (rec)
            items.push(...chatItemsOf(rec, seq));
    }
    const failedIds = new Set(items.filter(i => i.err).map(i => i.id.replace(/:err$/, "")));
    const merged = [];
    for (const it of items) {
        if (it.err)
            continue;
        merged.push(it.kind === "tool" && failedIds.has(it.id) ? { ...it, err: true } : it);
    }
    return merged.slice(-limit);
}
