import type { ChatMessage } from "./useChatStore";
import type { ExecutionPlan } from "./executionPlan";

export const CHARS_PER_TOKEN = 4;

export type GenerationMessage = { role: string; content: string };
export type GenerateFunction = (messages: GenerationMessage[], onToken?: (token: string) => void) => Promise<string>;

const RESPONSE_QUALITY_RULES = `## Response Quality Rules
- Answer directly first. Do not start with meta commentary.
- Prefer short paragraphs and clean bullets.
- Do not use markdown tables unless the user explicitly asks for a table.
- For current questions, distinguish source-backed facts from inference.
- If sources disagree or measure different things, say that plainly.
- Use citations like [1], [2] only for claims supported by provided search results.`;

function estimateTokens(text: string): number {
    return text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

export interface BuildExecutionMessagesInput {
    plan: Pick<ExecutionPlan, "contextBudget">;
    message: string;
    systemContent: string;
    history: ReadonlyArray<Pick<ChatMessage, "role" | "content">>;
    ragCtx: string;
    memCtx: string;
    searchCtx: string;
    fileNames: readonly string[];
}

/** Pure prompt builder; its only size authority is the request plan. */
export function buildExecutionMessages(input: BuildExecutionMessagesInput): GenerationMessage[] {
    const { plan, message, systemContent, history, ragCtx, memCtx, searchCtx, fileNames } = input;
    const maxContextTokens = Math.max(1, plan.contextBudget);
    const isSmallModel = maxContextTokens <= 3_500;
    const maxPerSource = isSmallModel ? 800 : 10_000;
    const contextParts: string[] = [];

    if (ragCtx) {
        const cappedRag =
            ragCtx.length > maxPerSource * 2 ? `${ragCtx.slice(0, maxPerSource * 2)}\n...[document truncated]` : ragCtx;
        contextParts.push(
            `## Attached Files: ${fileNames.join(", ")}\nThe user has uploaded documents. Here is the content:\n${cappedRag}\nYou MUST use this document content to answer. Reference the file names when quoting.`
        );
    }
    if (searchCtx.trim()) {
        const cappedSearch =
            searchCtx.length > maxPerSource
                ? `${searchCtx.slice(0, maxPerSource)}\n...[search results truncated]`
                : searchCtx;
        contextParts.push(
            `## Web Search Results\n${cappedSearch.trim()}\nUse these results for an accurate, up-to-date answer. Cite sources.`
        );
    }
    if (memCtx) contextParts.push(`## Memory\n${memCtx}`);

    let userContextBlock =
        contextParts.length > 0
            ? `[CONTEXT]\n${contextParts.join("\n\n")}\n[END CONTEXT]\n\nBased on the context above, answer the following:\n`
            : "";
    const systemForModel = `${systemContent.trim()}\n\n${RESPONSE_QUALITY_RULES}`;
    let baseTokens = estimateTokens(systemForModel) + estimateTokens(message);

    if (userContextBlock) {
        const contextTokens = estimateTokens(userContextBlock);
        if (baseTokens + contextTokens > maxContextTokens) {
            const safeCharLimit = Math.max(0, (maxContextTokens - baseTokens) * CHARS_PER_TOKEN);
            let truncated = userContextBlock.slice(0, safeCharLimit);
            const cutPoint = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("\n\n"));
            if (cutPoint > safeCharLimit * 0.7) truncated = truncated.slice(0, cutPoint);
            userContextBlock = truncated
                ? `${truncated}\n\n...[Context truncated to fit memory window]\n\nBased on the context above, answer the following:\n`
                : "";
        }
        baseTokens += estimateTokens(userContextBlock);
    }

    const messages: GenerationMessage[] = [{ role: "system", content: systemForModel }];
    let currentTokens = baseTokens;
    const trimmedHistory: GenerationMessage[] = [];
    for (let index = history.length - 1; index >= 0; index--) {
        const historyMessage = history[index];
        const tokens = estimateTokens(historyMessage.content);
        if (currentTokens + tokens > maxContextTokens) break;
        trimmedHistory.unshift({ role: historyMessage.role, content: historyMessage.content });
        currentTokens += tokens;
    }
    messages.push(...trimmedHistory);
    messages.push({ role: "user", content: userContextBlock ? userContextBlock + message : message });
    return messages;
}
