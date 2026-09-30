// @ts-nocheck
const CLASS_BY_TOOL = {
    Bash: "shell",
    PowerShell: "shell",
    Monitor: "shell",
    TaskStop: "shell",
    KillShell: "shell",
    BashOutput: "shell",
    Read: "read",
    Grep: "read",
    Glob: "read",
    LSP: "read",
    NotebookRead: "read",
    ReadMcpResourceTool: "read",
    ListMcpResourcesTool: "read",
    ReadMcpResourceDirTool: "read",
    Edit: "edit",
    Write: "edit",
    MultiEdit: "edit",
    NotebookEdit: "edit",
    WebFetch: "web",
    WebSearch: "web",
    Agent: "sub",
    Task: "sub",
    AskUserQuestion: "turn",
    ExitPlanMode: "turn",
};
const WEB_COMMAND_RE = /browser-harness|\bcurl\b|\bwget\b|Invoke-WebRequest|Invoke-RestMethod/;
function str(v) {
    return typeof v === "string" ? v : "";
}
export function clip(s, n) {
    if (s == null)
        return "";
    const t = String(s).replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
export function baseName(p) {
    const s = str(p);
    if (!s)
        return "";
    return s.split(/[\\/]/).filter(Boolean).pop() || s;
}
export function firstLine(s) {
    const t = str(s);
    return t.split("\n").find(l => l.trim()) || "";
}
export function categorize(name, input) {
    const c = CLASS_BY_TOOL[name];
    if (c === "shell" && WEB_COMMAND_RE.test(str(input?.command)))
        return "web";
    return c ?? "other";
}
export function toolName(name) {
    if (name.startsWith("mcp__")) {
        const server = name.split("__")[1] || "mcp";
        return "mcp:" + server.replace(/^claude_ai_/, "").replace(/^plugin_[^_]+_/, "");
    }
    return name;
}
function questionText(input) {
    const qs = input?.questions;
    if (Array.isArray(qs) && qs[0] && typeof qs[0] === "object")
        return str(qs[0].question);
    return "";
}
export function toolLabel(name, input) {
    const i = input ?? {};
    switch (name) {
        case "Bash":
        case "PowerShell":
        case "Monitor":
            return str(i.description) || firstLine(i.command);
        case "Read":
        case "Edit":
        case "MultiEdit":
        case "Write":
            return baseName(i.file_path);
        case "NotebookEdit":
            return baseName(i.notebook_path);
        case "Grep":
            return `"${str(i.pattern)}"` + (i.path ? " · " + baseName(i.path) : "");
        case "Glob":
            return str(i.pattern);
        case "WebFetch":
            try {
                return new URL(str(i.url)).hostname;
            }
            catch {
                return str(i.url);
            }
        case "WebSearch":
            return str(i.query);
        case "Agent":
        case "Task":
            return str(i.description) || str(i.subagent_type) || "Subagent";
        case "Skill":
            return str(i.skill);
        case "ToolSearch":
            return str(i.query);
        case "SendMessage":
            return "to " + (str(i.summary) || str(i.to));
        case "AskUserQuestion":
            return questionText(i) || "Question";
        case "ExitPlanMode":
            return "Plan approval";
        case "TodoWrite":
            return "Task list";
    }
    if (name.startsWith("mcp__"))
        return name.split("__").slice(2).join("__");
    return name;
}
export function toolDetail(input) {
    const i = input ?? {};
    if (i.command)
        return clip(i.command, 320);
    if (i.file_path)
        return clip(i.file_path, 320);
    if (i.url)
        return clip(i.url, 320);
    if (i.prompt)
        return clip(i.prompt, 320);
    if (i.pattern)
        return clip(`${str(i.pattern)} ${str(i.path)}`, 320);
    if (i.query)
        return clip(i.query, 320);
    try {
        return clip(JSON.stringify(i), 240);
    }
    catch {
        return "";
    }
}
const NOT_HUMAN_RE = /^<(command-|local-command|task-notification|system-reminder|bash-|user-memory|teammate)/;
export function isHumanPrompt(text) {
    const t = text.trimStart();
    return !NOT_HUMAN_RE.test(t) && !t.startsWith("Caveat:");
}
