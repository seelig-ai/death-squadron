// @ts-nocheck
import fs from "node:fs";
import { completeLines, readTailGuarded, statGuarded } from "./file-guard.js";
import { HISTORY_MS, TranscriptModel } from "./ingest.js";
import { listSubagents, subagentDir } from "./subagents.js";
import { Tailer } from "./tail.js";
import { condenseChat, CHAT_DEFAULT_LIMIT } from "./chat.js";
export const MAIN_BACKFILL_BYTES = 8 << 20;
export const SUB_BACKFILL_BYTES = 4 << 20;
export const MAX_PASSES_PER_POLL = 12;
export const SUB_RESCAN_MS = 60_000;
export const CHAT_TAIL_BYTES = 768 << 10;
export class TranscriptReader {
    file;
    model;
    tailer;
    started = false;
    truncated = false;
    version = 0;
    backfillBytes;
    constructor(file, kind, backfillBytes = kind === "main" ? MAIN_BACKFILL_BYTES : SUB_BACKFILL_BYTES) {
        this.file = file;
        this.backfillBytes = backfillBytes;
        this.model = new TranscriptModel(kind);
        this.tailer = new Tailer(() => {
            this.model.reset();
            this.truncated = false;
            this.version++;
        });
    }
    get isTruncated() {
        return this.truncated;
    }
    get changeVersion() {
        return this.version;
    }
    poll(now, stats) {
        let size;
        try {
            size = statGuarded(this.file).size;
        }
        catch {
            return false;
        }
        if (stats)
            stats.filesStatted++;
        if (!this.started) {
            this.started = true;
            if (size > this.backfillBytes) {
                this.tailer.seek(this.file, size - this.backfillBytes);
                this.truncated = true;
            }
        }
        let changed = false;
        for (let pass = 0; pass < MAX_PASSES_PER_POLL; pass++) {
            const before = this.tailer.offsetOf(this.file);
            let lines;
            try {
                lines = this.tailer.readNew(this.file);
            }
            catch {
                break;
            }
            const after = this.tailer.offsetOf(this.file);
            if (stats)
                stats.bytesRead += Math.max(0, after - before);
            if (!lines.length && after === before)
                break;
            for (const line of lines)
                this.model.ingestLine(line);
            if (stats)
                stats.linesIngested += lines.length;
            if (lines.length)
                changed = true;
        }
        this.model.prune(now - HISTORY_MS);
        if (changed)
            this.version++;
        return changed;
    }
    summary() {
        return this.model.summary();
    }
}
export function readChat(file, limit = CHAT_DEFAULT_LIMIT, maxBytes = CHAT_TAIL_BYTES) {
    const { text, start } = readTailGuarded(file, maxBytes);
    return condenseChat(completeLines(text, start > 0), limit);
}
export class Fleet {
    readers = new Map();
    subCache = new Map();
    version = 0;
    get changeVersion() {
        return this.version;
    }
    reader(file, kind) {
        let r = this.readers.get(file);
        if (!r) {
            r = new TranscriptReader(file, kind);
            this.readers.set(file, r);
            this.version++;
        }
        return r;
    }
    subagentsOf(file, now, stats) {
        const dir = subagentDir(file);
        let dirMtime = -1;
        try {
            dirMtime = fs.statSync(dir).mtimeMs;
        }
        catch {
            dirMtime = -1;
        }
        if (stats)
            stats.filesStatted++;
        const cached = this.subCache.get(file);
        if (cached && cached.dirMtime === dirMtime && now - cached.scannedAt < SUB_RESCAN_MS)
            return cached.metas;
        const metas = dirMtime < 0 ? [] : listSubagents(file, now - HISTORY_MS);
        if (stats)
            stats.filesStatted += metas.length;
        this.subCache.set(file, { scannedAt: now, dirMtime, metas });
        return metas;
    }
    poll(inputs, now, stats) {
        const live = new Set();
        const out = [];
        for (const input of inputs) {
            if (!input.file) {
                out.push({ id: input.id, file: null, summary: null, truncated: false, subagents: [] });
                continue;
            }
            live.add(input.file);
            const main = this.reader(input.file, "main");
            if (main.poll(now, stats))
                this.version++;
            const subs = [];
            for (const meta of this.subagentsOf(input.file, now, stats)) {
                live.add(meta.file);
                const r = this.reader(meta.file, "sub");
                if (r.poll(now, stats))
                    this.version++;
                subs.push({ meta, summary: r.summary(), truncated: r.isTruncated });
            }
            out.push({ id: input.id, file: input.file, summary: main.summary(), truncated: main.isTruncated, subagents: subs });
        }
        for (const file of [...this.readers.keys()]) {
            if (!live.has(file)) {
                this.readers.delete(file);
                this.version++;
            }
        }
        for (const file of [...this.subCache.keys()])
            if (!live.has(file))
                this.subCache.delete(file);
        return out;
    }
    size() {
        return this.readers.size;
    }
}
