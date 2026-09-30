// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
const READABLE_EXT = new Set([".json", ".jsonl"]);
export class RefusedFileError extends Error {
    file;
    constructor(file) {
        super(`live-core reads only .json and .jsonl files, refused: ${path.basename(file)}`);
        this.name = "RefusedFileError";
        this.file = file;
    }
}
export function isReadableName(file) {
    return READABLE_EXT.has(path.extname(file).toLowerCase());
}
export function assertReadable(file) {
    if (!isReadableName(file))
        throw new RefusedFileError(file);
}
export function openGuarded(file) {
    assertReadable(file);
    return fs.openSync(file, "r");
}
export function readGuarded(file) {
    assertReadable(file);
    return fs.readFileSync(file, "utf8");
}
export function statGuarded(file) {
    assertReadable(file);
    return fs.statSync(file);
}
export function readTailGuarded(file, maxBytes) {
    const size = statGuarded(file).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    if (len <= 0)
        return { text: "", size, start };
    const fd = openGuarded(file);
    try {
        const buf = Buffer.allocUnsafe(len);
        let got = 0;
        while (got < len) {
            const n = fs.readSync(fd, buf, got, len - got, start + got);
            if (n <= 0)
                break;
            got += n;
        }
        return { text: buf.toString("utf8", 0, got), size, start };
    }
    finally {
        fs.closeSync(fd);
    }
}
export function completeLines(text, startsMidFile) {
    const lines = text.split("\n");
    if (startsMidFile)
        lines.shift();
    if (!text.endsWith("\n"))
        lines.pop();
    return lines.filter(l => l.length > 1);
}
