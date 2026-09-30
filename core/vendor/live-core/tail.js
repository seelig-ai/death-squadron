// @ts-nocheck
import fs from "node:fs";
import { openGuarded, statGuarded } from "./file-guard.js";
export const MAX_BATCH_BYTES = 1 << 20;
const NL = 0x0a;
export class Tailer {
    offsets = new Map();
    stats = { resets: 0, skipped: 0 };
    onReset;
    onSkip;
    batchBytes;
    constructor(onReset, onSkip, batchBytes = MAX_BATCH_BYTES) {
        this.onReset = onReset;
        this.onSkip = onSkip;
        this.batchBytes = batchBytes;
    }
    offsetOf(file) {
        return this.offsets.get(file) ?? 0;
    }
    seek(file, offset) {
        this.offsets.set(file, Math.max(0, offset));
    }
    forget(file) {
        this.offsets.delete(file);
    }
    snapshot() {
        return { ...this.stats };
    }
    readNew(file) {
        const size = statGuarded(file).size;
        let off = this.offsets.get(file) ?? 0;
        if (size < off) {
            this.stats.resets += 1;
            off = 0;
            this.offsets.set(file, 0);
            this.onReset?.(file);
        }
        if (size === off)
            return [];
        const want = Math.min(size - off, this.batchBytes);
        const buf = Buffer.allocUnsafe(want);
        const read = this.fill(file, buf, off);
        if (read === 0)
            return [];
        const chunk = buf.subarray(0, read);
        const lastNl = chunk.lastIndexOf(NL);
        if (lastNl === -1) {
            if (read === want && want === this.batchBytes) {
                this.stats.skipped += 1;
                this.offsets.set(file, off + read);
                this.onSkip?.(file);
            }
            return [];
        }
        this.offsets.set(file, off + lastNl + 1);
        const out = [];
        let start = 0;
        while (start <= lastNl) {
            let end = chunk.indexOf(NL, start);
            if (end === -1 || end > lastNl)
                end = lastNl;
            if (end > start)
                out.push(chunk.toString("utf8", start, end));
            start = end + 1;
        }
        return out;
    }
    fill(file, buf, position) {
        const fd = openGuarded(file);
        try {
            let got = 0;
            while (got < buf.length) {
                const n = fs.readSync(fd, buf, got, buf.length - got, position + got);
                if (n <= 0)
                    break;
                got += n;
            }
            return got;
        }
        finally {
            fs.closeSync(fd);
        }
    }
}
