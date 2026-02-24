"use client";

import { create } from "zustand";

// ─── ReAct Agent Loop v2 ──────────────────────────────────────────────
// The first fully in-browser autonomous agent.
// Thought → Action → Observation → repeat until solved.
// Zero backend. Zero API keys. 100% WebGPU.
//
// Engineering:
// • AbortController-based cancellation (stop button kills everything)
// • Per-tool execution timeouts (no hung searches blocking forever)
// • Context window budgeting (prevents OOM from growing msg context)
// • Loop detection (catches LLM calling same tool 3x in a row)
// • Multi-strategy JSON parsing (handles LLM format mistakes)
// • Elapsed time tracking per step for profiling

export interface AgentStep {
    id: number;
    type: "thought" | "action" | "observation" | "final" | "error";
    content: string;
    tool?: string;
    args?: Record<string, any>;
    timestamp: number;
    durationMs?: number;     // how long this step took (for actions)
}

export type AgentStatus = "idle" | "thinking" | "acting" | "done" | "error";

interface AgentState {
    steps: AgentStep[];
    status: AgentStatus;
    enabled: boolean;
    currentIteration: number;
    elapsedMs: number;       // total wall-clock time since loop start

    // Actions
    toggle: () => void;
    reset: () => void;
    abort: () => void;
    runLoop: (
        query: string,
        tools: AgentToolkit,
        generate: (msgs: { role: string; content: string }[], onToken?: (t: string) => void) => Promise<string>,
        systemPrompt: string,
    ) => Promise<string>;
}

// ─── Tool types ─────────────────────────────────────────────────────

export interface AgentToolkit {
    webSearch?: (query: string) => Promise<string>;
    ragSearch?: (query: string) => Promise<string>;
    python?: (code: string) => Promise<string>;
    memorySave?: (content: string) => Promise<string>;
    memoryRecall?: (query: string) => string;
}

// ─── Config ─────────────────────────────────────────────────────────

const MAX_ITERATIONS = 8;
const TOOL_TIMEOUT_MS = 30_000;       // 30s max per tool execution
const MAX_CONTEXT_CHARS = 12_000;     // ~3k tokens — keeps context within model window
const MAX_LOOP_REPEATS = 3;           // same tool+args 3x = force stop

// ─── System prompt for agent mode ────────────────────────────────────

function buildAgentPrompt(base: string, availableTools: string[]): string {
    const toolList = availableTools.length > 0
        ? availableTools.join(", ")
        : "none (answer from your own knowledge)";

    return `${base}

You are an autonomous AI agent. You MUST solve problems step-by-step by using tools.

AVAILABLE TOOLS: ${toolList}

TO USE A TOOL, you must output EXACTLY this JSON format on its own line:
{"tool": "TOOL_NAME", "args": {"key": "value"}}

Tool reference:
• webSearch — search the live web. Args: {"query": "search terms"}
• ragSearch — search user's uploaded documents. Args: {"query": "search terms"}
• python — execute Python code. Args: {"code": "python code here"}
• memorySave — persist information. Args: {"content": "text to save"}
• memoryRecall — recall saved info. Args: {"query": "search terms"}

EXAMPLE 1 — User asks "what is the population of France?"
I need to search for the current population of France.
{"tool": "webSearch", "args": {"query": "population of France 2025"}}

EXAMPLE 2 — User asks "calculate 17 * 23 + 5"
Let me use Python to compute this accurately.
{"tool": "python", "args": {"code": "result = 17 * 23 + 5\\nprint(result)"}}

CRITICAL RULES:
1. You MUST think first, then call exactly ONE tool per turn
2. After receiving a tool result, either call another tool OR give your FINAL answer
3. Your FINAL answer must contain NO JSON tool calls — just plain text
4. Do NOT skip tools — if a tool is available and relevant, USE IT
5. If a tool errors, try a different approach — do NOT retry the same call
6. For math or calculations, ALWAYS use the python tool
7. NEVER give a final answer on your first turn if tools are available — use at least one tool first`;
}

// ─── JSON Parser (multi-strategy) ───────────────────────────────────
// Small LLMs produce messy JSON. We handle:
// 1. Perfect JSON on its own line
// 2. JSON embedded in markdown code fences
// 3. JSON with single quotes
// 4. JSON buried mid-paragraph
// 5. Regex fallback extraction

interface ParsedToolCall {
    thought: string;
    tool: string;
    args: Record<string, any>;
}

function parseToolCall(text: string): ParsedToolCall | null {
    const lines = text.split("\n");
    let thought = "";
    let jsonCandidate = "";

    // Strategy 1: Find a line that looks like {"tool": ...}
    for (const line of lines) {
        const trimmed = line.trim();

        // Skip markdown code fences
        if (trimmed === "```json" || trimmed === "```") continue;

        // Check for JSON-shaped content
        if ((trimmed.startsWith("{") && trimmed.includes("tool")) ||
            (trimmed.startsWith("{'") && trimmed.includes("tool"))) {
            jsonCandidate = trimmed;
            break;
        }

        // Everything before the JSON is "thought"
        if (!jsonCandidate) {
            thought += line + "\n";
        }
    }

    // Strategy 2: Regex sweep for embedded JSON (LLM wrapped it in text)
    if (!jsonCandidate) {
        const embedded = text.match(/\{[^{}]*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^}]*\}[^{}]*\}/);
        if (embedded) {
            jsonCandidate = embedded[0];
            thought = text.slice(0, text.indexOf(jsonCandidate)).trim();
        }
    }

    // Strategy 3: Look inside markdown code fences
    if (!jsonCandidate) {
        const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenced) {
            const inner = fenced[1].trim();
            if (inner.includes('"tool"') || inner.includes("'tool'")) {
                jsonCandidate = inner;
                thought = text.slice(0, text.indexOf("```")).trim();
            }
        }
    }

    if (!jsonCandidate) return null;

    // Attempt parse with multiple normalizations
    for (const attempt of [
        jsonCandidate,
        jsonCandidate.replace(/'/g, '"'),
        jsonCandidate.replace(/'/g, '"').replace(/(\w)"(\w)/g, "$1'$2"),
        jsonCandidate.replace(/,\s*}/g, "}"),  // trailing comma
    ]) {
        try {
            const parsed = JSON.parse(attempt);
            if (parsed.tool && typeof parsed.tool === "string") {
                return {
                    thought: thought.trim(),
                    tool: parsed.tool,
                    args: parsed.args || {},
                };
            }
        } catch { /* try next */ }
    }

    // Strategy 5: Regex extraction as last resort
    const toolMatch = jsonCandidate.match(/["']tool["']\s*:\s*["']([^"']+)["']/);
    if (toolMatch) {
        let args: Record<string, any> = {};
        // Try to extract common arg patterns
        const queryMatch = jsonCandidate.match(/["'](?:query|q)["']\s*:\s*["']([^"']+)["']/);
        const codeMatch = jsonCandidate.match(/["']code["']\s*:\s*["']([^"']+)["']/);
        const contentMatch = jsonCandidate.match(/["']content["']\s*:\s*["']([^"']+)["']/);

        if (queryMatch) args.query = queryMatch[1];
        if (codeMatch) args.code = codeMatch[1];
        if (contentMatch) args.content = contentMatch[1];

        return {
            thought: thought.trim(),
            tool: toolMatch[1],
            args,
        };
    }

    return null;
}

// ─── Tool executor with timeout ─────────────────────────────────────

async function executeTool(
    toolName: string,
    args: Record<string, any>,
    toolkit: AgentToolkit,
    signal: AbortSignal
): Promise<string> {
    // Check abort before starting
    if (signal.aborted) return "[Cancelled]";

    const toolFn = (() => {
        switch (toolName) {
            case "webSearch": return toolkit.webSearch ? () => toolkit.webSearch!(args.query || args.q || "") : null;
            case "ragSearch": return toolkit.ragSearch ? () => toolkit.ragSearch!(args.query || args.q || "") : null;
            case "python": return toolkit.python ? () => toolkit.python!(args.code || args.script || "") : null;
            case "memorySave": return toolkit.memorySave ? () => toolkit.memorySave!(args.content || args.text || "") : null;
            case "memoryRecall": return toolkit.memoryRecall ? () => Promise.resolve(toolkit.memoryRecall!(args.query || args.q || "")) : null;
            default: return null;
        }
    })();

    if (!toolFn) {
        const valid = ["webSearch", "ragSearch", "python", "memorySave", "memoryRecall"];
        if (!valid.includes(toolName)) {
            return `[Error] Unknown tool "${toolName}". Available: ${valid.join(", ")}`;
        }
        return `[Error] ${toolName} is not currently available. Try a different approach.`;
    }

    // Race between tool execution, timeout, and abort
    try {
        const result = await Promise.race([
            toolFn(),
            new Promise<string>((_, reject) => {
                const timer = setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS);
                signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Cancelled")); });
            }),
        ]);
        return result || "Tool returned empty result.";
    } catch (e: any) {
        if (e.message === "Cancelled") return "[Cancelled]";
        return `[Error] ${toolName} failed: ${e.message || String(e)}`;
    }
}

// ─── Context window budget management ──────────────────────────────
// Small models (1-3B) have 2-4K context windows.
// If we shove all observations in verbatim, we OOM the window.
// Strategy: summarize old observations, keep recent ones full.

function budgetContext(msgs: { role: string; content: string }[]): { role: string; content: string }[] {
    let totalChars = 0;
    for (const m of msgs) totalChars += m.content.length;

    if (totalChars <= MAX_CONTEXT_CHARS) return msgs;

    // Keep system prompt and original user query intact
    const result = [msgs[0], msgs[1]]; // system + user
    const rest = msgs.slice(2);

    // Keep the most recent 4 messages in full
    const recentCount = Math.min(4, rest.length);
    const old = rest.slice(0, rest.length - recentCount);
    const recent = rest.slice(rest.length - recentCount);

    // Compress old messages
    if (old.length > 0) {
        const summary = old.map(m => {
            const role = m.role === "assistant" ? "Agent" : "Tool";
            // Aggressively truncate old content
            const content = m.content.length > 200
                ? m.content.slice(0, 200) + "..."
                : m.content;
            return `[${role}] ${content}`;
        }).join("\n");

        result.push({
            role: "user",
            content: `[Previous context summary]\n${summary}\n[End summary — focus on the most recent information below]`,
        });
    }

    result.push(...recent);
    return result;
}

// ─── Loop detection ─────────────────────────────────────────────────
// Catches the LLM calling the same tool with same args repeatedly

function detectLoop(steps: AgentStep[]): boolean {
    const actions = steps.filter(s => s.type === "action");
    if (actions.length < MAX_LOOP_REPEATS) return false;

    const recent = actions.slice(-MAX_LOOP_REPEATS);
    const signatures = recent.map(a => `${a.tool}:${JSON.stringify(a.args)}`);
    return signatures.every(s => s === signatures[0]);
}

// ─── Abort controller ───────────────────────────────────────────────

let activeAbort: AbortController | null = null;

// ─── Zustand Store ──────────────────────────────────────────────────

export const useAgent = create<AgentState>((set, get) => ({
    steps: [],
    status: "idle",
    enabled: false,
    currentIteration: 0,
    elapsedMs: 0,

    toggle: () => set(s => ({ enabled: !s.enabled })),

    reset: () => {
        if (activeAbort) { activeAbort.abort(); activeAbort = null; }
        set({ steps: [], status: "idle", currentIteration: 0, elapsedMs: 0 });
    },

    abort: () => {
        if (activeAbort) { activeAbort.abort(); activeAbort = null; }
        set({ status: "done" });
    },

    runLoop: async (query, tools, generate, systemPrompt) => {
        // Cancel any existing run
        if (activeAbort) activeAbort.abort();
        activeAbort = new AbortController();
        const signal = activeAbort.signal;

        const loopStart = performance.now();
        set({ steps: [], status: "thinking", currentIteration: 0, elapsedMs: 0 });

        // Build available tool list (only show tools that actually exist)
        const availableTools: string[] = [];
        if (tools.webSearch) availableTools.push("webSearch");
        if (tools.ragSearch) availableTools.push("ragSearch");
        if (tools.python) availableTools.push("python");
        if (tools.memorySave) availableTools.push("memorySave");
        if (tools.memoryRecall) availableTools.push("memoryRecall");

        const agentPrompt = buildAgentPrompt(systemPrompt, availableTools);

        const msgs: { role: string; content: string }[] = [
            { role: "system", content: agentPrompt },
            { role: "user", content: query },
        ];

        let stepId = 0;
        let finalAnswer = "";

        const addStep = (step: Omit<AgentStep, "id" | "timestamp">) => {
            if (signal.aborted) return;
            const fullStep: AgentStep = { ...step, id: stepId++, timestamp: Date.now() };
            set(s => ({
                steps: [...s.steps, fullStep],
                elapsedMs: Math.round(performance.now() - loopStart),
            }));
            return fullStep;
        };

        const updateElapsed = () => {
            set({ elapsedMs: Math.round(performance.now() - loopStart) });
        };

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            if (signal.aborted) break;

            set({ currentIteration: i + 1, status: "thinking" });
            updateElapsed();

            // Budget context before each LLM call
            const budgeted = budgetContext(msgs);

            // Generate LLM response
            let llmOutput = "";
            try {
                llmOutput = await generate(budgeted, undefined);
            } catch (e: any) {
                if (signal.aborted) break;
                addStep({ type: "error", content: `LLM generation failed: ${e.message}` });
                set({ status: "error" });
                return `Agent error: ${e.message}`;
            }

            if (signal.aborted) break;

            // Clean LLM output (strip thinking tags some models emit)
            llmOutput = llmOutput
                .replace(/<think>[\s\S]*?<\/think>/g, "")
                .trim();

            // Try to parse a tool call
            const toolCall = parseToolCall(llmOutput);

            if (!toolCall) {
                // No tool call → final answer
                addStep({ type: "final", content: llmOutput });
                finalAnswer = llmOutput;
                set({ status: "done" });
                updateElapsed();
                break;
            }

            // Check for loop detection BEFORE executing
            const pendingSteps = get().steps;
            const testSteps = [...pendingSteps, {
                id: -1, type: "action" as const, content: "", timestamp: 0,
                tool: toolCall.tool, args: toolCall.args,
            }];
            if (detectLoop(testSteps)) {
                addStep({ type: "error", content: `Loop detected: calling ${toolCall.tool} with same args ${MAX_LOOP_REPEATS}x. Breaking to give answer.` });
                // Force the LLM to answer by removing tools
                msgs.push({ role: "assistant", content: llmOutput });
                msgs.push({ role: "user", content: "You're repeating the same tool call. Please give your FINAL ANSWER now based on what you already know." });
                continue;
            }

            // Record thought
            if (toolCall.thought) {
                addStep({ type: "thought", content: toolCall.thought });
            }

            // Record action
            const argsDisplay = Object.entries(toolCall.args)
                .map(([k, v]) => {
                    const s = typeof v === "string" ? v : JSON.stringify(v);
                    return `${k}: ${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
                })
                .join(", ");
            addStep({
                type: "action",
                content: `${toolCall.tool}(${argsDisplay})`,
                tool: toolCall.tool,
                args: toolCall.args,
            });

            set({ status: "acting" });
            updateElapsed();

            // Execute tool with timeout + abort
            const toolStart = performance.now();
            const observation = await executeTool(toolCall.tool, toolCall.args, tools, signal);
            const toolDuration = Math.round(performance.now() - toolStart);

            if (signal.aborted) break;

            // Record observation with execution time
            const obsContent = observation.length > 2000
                ? observation.slice(0, 2000) + "\n··· [truncated]"
                : observation;
            addStep({
                type: "observation",
                content: obsContent,
                durationMs: toolDuration,
            });

            // Append to LLM context for next iteration
            msgs.push({ role: "assistant", content: llmOutput });
            msgs.push({
                role: "user",
                content: `Tool result (${toolCall.tool}, ${toolDuration}ms):\n${obsContent}\n\nUse this information to either call another tool or provide your final answer.`,
            });
        }

        // Handle abort
        if (signal.aborted) {
            const lastObs = get().steps.filter(s => s.type === "observation").pop();
            finalAnswer = lastObs
                ? `Stopped by user. Partial result:\n\n${lastObs.content}`
                : "Agent was stopped.";
            addStep({ type: "final", content: finalAnswer });
            set({ status: "done" });
        }

        // Handle max iterations reached without answer
        if (!finalAnswer && !signal.aborted) {
            const observations = get().steps.filter(s => s.type === "observation");
            if (observations.length > 0) {
                const lastObs = observations[observations.length - 1];
                finalAnswer = `Reached step limit (${MAX_ITERATIONS}). Here's what I found:\n\n${lastObs.content}`;
            } else {
                finalAnswer = "Reached the step limit without finding an answer. Try rephrasing or breaking into smaller questions.";
            }
            addStep({ type: "final", content: finalAnswer });
            set({ status: "done" });
        }

        updateElapsed();
        activeAbort = null;
        return finalAnswer;
    },
}));
