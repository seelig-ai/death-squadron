// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { readGuarded, statGuarded } from "./file-guard.js";
const AGENT_FILE_RE = /^agent-([\w-]+)\.jsonl$/;
export function subagentDir(transcriptFile) {
    return path.join(transcriptFile.replace(/\.jsonl$/i, ""), "subagents");
}
function str(v) {
    return typeof v === "string" ? v : "";
}
export function parseSubagentMeta(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        return {};
    }
    if (typeof raw !== "object" || raw === null)
        return {};
    const r = raw;
    return {
        agentType: str(r.agentType),
        description: str(r.description),
        toolUseId: str(r.toolUseId) || null,
        spawnDepth: typeof r.spawnDepth === "number" && r.spawnDepth > 0 ? r.spawnDepth : 1,
        parentAgentId: str(r.parentAgentId) || null,
        background: r.requestShape === "background",
    };
}
export function listSubagents(transcriptFile, sinceMs) {
    const dir = subagentDir(transcriptFile);
    let names;
    try {
        names = fs.readdirSync(dir);
    }
    catch {
        return [];
    }
    const out = [];
    for (const name of names) {
        const m = AGENT_FILE_RE.exec(name);
        if (!m)
            continue;
        const file = path.join(dir, name);
        let mtimeMs;
        try {
            mtimeMs = statGuarded(file).mtimeMs;
        }
        catch {
            continue;
        }
        if (mtimeMs < sinceMs)
            continue;
        const metaFile = path.join(dir, `agent-${m[1]}.meta.json`);
        let meta = {};
        let hasMeta = false;
        try {
            meta = parseSubagentMeta(readGuarded(metaFile));
            hasMeta = true;
        }
        catch {
            meta = {};
        }
        out.push({
            agentId: m[1],
            file,
            metaFile: hasMeta ? metaFile : null,
            agentType: meta.agentType || "subagent",
            description: meta.description || "",
            toolUseId: meta.toolUseId ?? null,
            spawnDepth: meta.spawnDepth ?? 1,
            parentAgentId: meta.parentAgentId ?? null,
            background: meta.background ?? false,
            mtimeMs,
        });
    }
    return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}
