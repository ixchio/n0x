# N0X Bug & Logic Issue Report

**Generated:** 2026-06-24  
**Severity Legend:** 🔴 Critical | 🟡 High | 🟠 Medium | 🟢 Low

---

## 🔴 CRITICAL BUGS

### 1. **Memory Leak: IndexedDB Handles Not Closed**

**File:** `lib/useMemory.ts:133-154`  
**Issue:** Database connection opened but never closed, causing handle leaks on every component mount.

```typescript
// Line 133-146
useEffect(() => {
    (async () => {
        let db: IDBDatabase | null = null;
        try {
            db = await openDB();
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                // ...
                db?.close(); // ✅ Closes here
            };
            tx.onerror = () => {
                setIsLoaded(true);
                db?.close();
            }; // ✅ Closes here
        } catch {
            setIsLoaded(true);
            db?.close(); // ✅ Closes here
        }
    })();
}, []);
```

**Problem:** If `openDB()` succeeds but the transaction setup throws synchronously before attaching handlers, `db` never closes.

**Fix:**

```typescript
try {
    db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
        const mems = (req.result || []).map((m: any) => ({
            ...m,
            keywords: m.keywords || extractKeywords(m.content),
        }));
        setMemories(mems);
        setIsLoaded(true);
        db?.close();
    };
    req.onerror = tx.onerror = () => {
        setIsLoaded(true);
        db?.close();
    };
} catch (e) {
    setIsLoaded(true);
    db?.close();
}
```

---

### 2. **Race Condition: Worker Resolver Map Never Cleaned on Error**

**File:** `lib/useRAG.ts:36-84`  
**Issue:** If worker crashes or returns malformed data, resolver never gets deleted from the Map.

```typescript
// Line 45-59
ragWorker.onmessage = e => {
    const { id, result, error, done, status } = e.data;

    if (status && window.__ON_RAG_STATUS) {
        window.__ON_RAG_STATUS(status);
    }

    if (done && resolvers.has(id)) {
        if (error) {
            resolvers.get(id)!.reject(new Error(error));
        } else {
            resolvers.get(id)!.resolve(result);
        }
        resolvers.delete(id); // ✅ ONLY deletes when `done` is truthy
    }
};
```

**Problem:** If worker sends `{id: 1, error: "fail"}` without `done: true`, resolver stays in Map forever → memory leak.

**Fix:**

```typescript
if (resolvers.has(id)) {
    if (error) {
        resolvers.get(id)!.reject(new Error(error));
        resolvers.delete(id); // Delete immediately on error
    } else if (done) {
        resolvers.get(id)!.resolve(result);
        resolvers.delete(id);
    }
}
```

---

### 3. **Null Dereference: `providerCtx` Can Be Undefined**

**File:** `lib/useChat.ts:61-64`  
**Issue:** Destructuring optional properties without checking if `providerCtx` exists.

```typescript
// Line 61-64
let activeProviderReady = false;
if (providerCtx?.provider === "chrome-ai") activeProviderReady = providerCtx.chromeAI?.status === "ready";
else if (providerCtx?.provider === "ollama")
    activeProviderReady = providerCtx.ollama.isSupported; // ❌
else if (providerCtx?.provider === "cloud")
    activeProviderReady = !!providerCtx.cloudAI.apiKey; // ❌
else activeProviderReady = webllm.status === "ready";
```

**Problem:** `providerCtx.ollama.isSupported` crashes if `providerCtx` is `undefined`.

**Fix:**

```typescript
else if (providerCtx?.provider === "ollama") activeProviderReady = !!providerCtx?.ollama?.isSupported;
else if (providerCtx?.provider === "cloud") activeProviderReady = !!providerCtx?.cloudAI?.apiKey;
```

---

### 4. **Infinite Loop Risk: Auto-Router Detection Logic**

**File:** `lib/useAutoRouter.ts:41-69`  
**Issue:** `classifyComplexity` can return "moderate" for messages that trigger deep search, creating a loop where the same message switches providers.

```typescript
// Line 96-105
switch (complexity) {
    case "simple":
        return { decision: "local", reason: "simple task → fast local inference" };
    case "moderate":
        // Deep search elevates moderate to cloud
        if (ctx.deepSearchEnabled) {
            return { decision: "cloud", reason: "search + moderate → cloud quality" };
        }
        return { decision: "local", reason: "moderate task → local" };
    case "complex":
        return { decision: "cloud", reason: "complex task → cloud for quality" };
}
```

**Problem:** If user enables deep search mid-conversation, the SAME message gets reclassified and re-routed → potential duplicate API calls.

**Suggested Fix:** Add a route cache/memo based on `message + deepSearchEnabled`.

---

### 5. **Type Mismatch: RAG Worker Chunk Storage**

**File:** `lib/rag.worker.ts:440-447`  
**Issue:** Cache may contain old string format but code expects `{text, embedding}` object.

```typescript
// Line 440-447
for (const [k, v] of cached.chunks) {
    // v may be the old string format (from pre-upgrade cache) or the new {text, embedding} shape
    if (typeof v === "string") {
        chunkStore.set(k, { text: v, embedding: [] });
    } else {
        chunkStore.set(k, v as { text: string; embedding: number[] });
    }
}
```

**Problem:** Later code at line 559 does `chunkStore.get(cid)?.text` expecting `.text` to exist. If cached format has `{text, embedding}` but embedding is `[]`, MMR reranking breaks because cosine similarity needs non-empty vectors.

**Fix:** Add validation:

```typescript
if (typeof v === "string") {
    chunkStore.set(k, { text: v, embedding: [] });
} else if (v && typeof v.text === "string" && Array.isArray(v.embedding)) {
    chunkStore.set(k, v as { text: string; embedding: number[] });
} else {
    console.warn(`Invalid cached chunk format for key ${k}, skipping`);
}
```

---

## 🟡 HIGH PRIORITY BUGS

### 6. **Unhandled Promise Rejection: Pyodide Package Load**

**File:** `lib/usePyodide.ts:113-118`  
**Issue:** `loadPackagesFromImports` errors are caught but execution continues, potentially causing cryptic import errors.

```typescript
// Auto-load packages from imports (graceful fallback)
try {
    await py.loadPackagesFromImports(code);
} catch (pkgErr: any) {
    console.warn("Package auto-load warning:", pkgErr.message);
    // Continue execution — the import itself may still work or give a clearer error
}
```

**Problem:** If package load fails, subsequent `import numpy` will crash with `ModuleNotFoundError`, but user only sees "Package auto-load warning" in console.

**Fix:** Return the error to the user:

```typescript
} catch (pkgErr: any) {
    return {
        output: "",
        error: `Package installation failed: ${pkgErr.message}. Some imports may not work.`,
        duration: Date.now() - start
    };
}
```

---

### 7. **Context Window Overflow: buildMessages Truncation Logic**

**File:** `lib/useChat.ts:314-323`  
**Issue:** Context is truncated mid-string without respecting token boundaries.

```typescript
// Line 317-321
if (baseTokens + ctxTokens > MAX_CONTEXT_TOKENS) {
    const safeCharLimit = (MAX_CONTEXT_TOKENS - baseTokens) * CHARS_PER_TOKEN;
    userContextBlock =
        userContextBlock.slice(0, safeCharLimit) +
        "\n\n...[Context truncated to fit memory window]\n\nBased on the context above, answer the following:\n";
}
```

**Problem:** Slicing mid-JSON/code block breaks syntax, confusing the model.

**Fix:** Truncate at sentence/paragraph boundaries:

```typescript
const safeCharLimit = (MAX_CONTEXT_TOKENS - baseTokens) * CHARS_PER_TOKEN;
let truncated = userContextBlock.slice(0, safeCharLimit);
const lastSentence = truncated.lastIndexOf(". ");
const lastNewline = truncated.lastIndexOf("\n\n");
const cutPoint = Math.max(lastSentence, lastNewline);
if (cutPoint > safeCharLimit * 0.7) truncated = truncated.slice(0, cutPoint);
userContextBlock = truncated + "\n\n...[Context truncated to fit memory window]\n\n";
```

---

### 8. **AbortController Leak: Cloud AI Stop**

**File:** `lib/useCloudAI.ts:233-239`  
**Issue:** `abortController` is module-scoped but never nulled out after successful completion.

```typescript
// Line 233-239
stop: () => {
    if (abortController) {
        abortController.abort();
    }
    set({ status: "ready" });
};
```

**Problem:** Calling `stop()` after natural completion will abort the _old_ controller, not the current one.

**Fix:**

```typescript
stop: () => {
    if (abortController) {
        abortController.abort();
        abortController = null; // Reset after abort
    }
    set({ status: "ready" });
};
```

And in `generate` after completion:

```typescript
// Line 220
set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now }, status: "ready" });
addTokens(tokenCount);
abortController = null; // Reset after successful completion
return fullResponse;
```

---

### 9. **Race: Auto-Router Can Trigger Mid-Stream**

**File:** `lib/useChat.ts:418-438`  
**Issue:** Auto-routing happens AFTER context gathering starts, so user pays for deep search even if message routes to local.

```typescript
// Line 406-437
const { ragCtx, memCtx, searchCtx, hasDocuments } = await gatherContext(message); // ❌ Deep search already ran
const msgs = buildMessages(message, persona.systemPrompt, ragCtx, memCtx, searchCtx);

try {
    setStreamingContent("");
    let full = "";
    let tokCount = 0;

    // Hybrid auto-routing: pick best provider per message
    let generate = getGenerateFn();
    let routeUsed: RouteDecision = "default";

    if (autoRouteEnabled) {
        const localReady = webllm.status === "ready" || ...;
        const cloudReady = !!providerCtx?.cloudAI.apiKey;

        const route = routeMessage({
            message,
            hasDocuments: !!hasDocuments,
            deepSearchEnabled: deepSearchEnabled,  // ❌ Search already completed
```

**Fix:** Route BEFORE gathering context:

```typescript
// Route FIRST
let generate = getGenerateFn();
let routeUsed: RouteDecision = "default";

if (autoRouteEnabled) {
    const localReady = ...;
    const cloudReady = ...;
    const route = routeMessage({...});
    routeUsed = route.decision;
    if (route.decision !== "default") {
        const routed = getGenerateFnFor(route.decision);
        if (routed) generate = routed;
    }
}

// THEN gather context (only if needed)
const { ragCtx, memCtx, searchCtx, hasDocuments } = await gatherContext(message);
```

---

## 🟠 MEDIUM PRIORITY

### 10. **Silent Failure: WebLLM Stall Watchdog Never Clears**

**File:** `lib/useWebLLM.ts:429-443`  
**Issue:** `stallWatchdog` interval is created but only cleared on success path.

```typescript
// Line 429-443
let lastProgress = 0;
let stallCount = 0;
const stallWatchdog = setInterval(() => {
    const cur = get().loadProgress;
    if (cur === lastProgress && cur < 1 && cur > 0) {
        stallCount++;
        if (stallCount >= 3) {
            set({ error: `Download stalled at ${Math.round(cur * 100)}%...` });
        }
    } else {
        stallCount = 0;
        lastProgress = cur;
    }
}, 10000);

// ...later...
clearInterval(stallWatchdog); // Line 475 — only in success case
```

**Problem:** If `CreateMLCEngine` throws before clearing, interval keeps running forever.

**Fix:** Use try/finally:

```typescript
const stallWatchdog = setInterval(() => {...}, 10000);
try {
    engine = await webllm.CreateMLCEngine(modelId, initOpts);
} catch (e) {
    throw e;
} finally {
    clearInterval(stallWatchdog);
}
```

---

### 11. **Agent Loop: Consecutive Error Counter Never Resets on Success**

**File:** `lib/useAgent.ts:489-520`  
**Issue:** `consecutiveErrors` increments on error, resets on success, but if success happens AFTER 3 errors, the "change strategy" prompt already fired.

```typescript
// Line 489-495
const isError = observation.startsWith("[Error]") || /failed|error|crashed/i.test(observation.slice(0, 50));
if (isError) {
    consecutiveErrors++;
} else {
    consecutiveErrors = 0; // ✅ Resets
}
```

**Problem:** User gets "repeatedly failing" message even if the 4th attempt succeeds.

**Suggested Fix:** Remove the intervention or make it only trigger once:

```typescript
if (consecutiveErrors >= 3) {
    msgs.push({
        role: "user",
        content: `Tool result (${toolCall.tool}, ${toolDuration}ms):\n${obsContent}\n\nSystem Intervention: Last 3 tool calls failed. Try a different approach or provide your final answer.`,
    });
    consecutiveErrors = 0; // Reset after intervention so we don't spam
}
```

---

### 12. **Deep Search: Jina Extract Can Return Empty String**

**File:** `app/api/deep-search/route.ts:210-232`  
**Issue:** Jina extraction returns `""` but code still pushes it to `allContent`.

```typescript
// Line 292-307
if (allContent.length < 2 && allResults.length > 0) {
    const jinaUrls = allResults
        .filter(r => r.source !== "wikipedia" && r.url.startsWith("http"))
        .slice(0, 2)
        .map(r => r.url);

    if (jinaUrls.length > 0) {
        const extracts = await Promise.all(jinaUrls.map(extractWithJina));
        for (let i = 0; i < extracts.length; i++) {
            if (extracts[i].length > 80 && allContent.length < 4) {
                // ✅ Checks length
                allContent.push(extracts[i]);
                if (!allSources.includes(jinaUrls[i])) allSources.push(jinaUrls[i]);
            }
        }
    }
}
```

**Actually OK** — the code checks `extracts[i].length > 80` before pushing. **No bug here.**

---

### 13. **Storage Manager: Page Reload During Indexing Loses Data**

**File:** `components/storage-manager.tsx:14-30`  
**Issue:** Page reload is hardcoded 600ms after DB deletion, but if another tab has the DB open, `onblocked` fires and we reload anyway.

```typescript
// Line 14-30
const clearDatabase = async (dbName: string, target: ClearTarget) => {
    setClearing(target);
    setConfirmTarget(null);
    try {
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            // onblocked fires when another tab has the DB open; still resolve so UX doesn't hang
            req.onblocked = () => resolve(); // ❌ Treats block as success
        });
        setTimeout(() => window.location.reload(), 600);
```

**Problem:** If another tab blocks deletion, we reload the page thinking it succeeded → DB still exists, user confused.

**Fix:** Show a message instead of reloading:

```typescript
req.onblocked = () => {
    setClearing(null);
    alert("Database is being used in another tab. Close other tabs and try again.");
    reject(new Error("Blocked by another tab"));
};
```

---

## 🟢 LOW PRIORITY / CODE QUALITY

### 14. **Dead Code: Image Gen Horde Fallback Never Used**

**File:** `app/api/image-gen/route.ts:140-169`  
**Issue:** The `tryAIHorde` function is defined but never called.

```typescript
// Line 140-164
export async function POST(request: NextRequest) {
    try {
        const { prompt, model: preferredModel } = await request.json();
        if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

        const cleanPrompt = prompt
            .replace(/^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, "")
            .replace(/^image:\s*/i, "")
            .replace(/^\/image\s+/i, "")
            .trim() || prompt;

        const apiKey = process.env.POLLINATIONS_API_KEY;
        let result: GenResult | null = null;

        // Path A: Free API key set → gen.pollinations.ai with auth (returns base64, key hidden)
        if (apiKey) {
            result = await tryPollinationsWithKey(cleanPrompt, apiKey, preferredModel);
        }

        // Path B: No key → image.pollinations.ai direct URL (client loads it)
        if (!result) {
            result = pollinationsFreeUrl(cleanPrompt, "turbo");
        }

        return NextResponse.json({ success: true, image: result.image, provider: result.provider });
```

**Problem:** Horde is never tried, making the comment on line 8 misleading.

**Fix:** Either remove `tryAIHorde` or add it as a fallback:

```typescript
// Path C: Pollinations failed → AI Horde
if (!result) {
    result = await tryAIHorde(cleanPrompt);
}
if (!result) {
    return NextResponse.json({ error: "All providers failed" }, { status: 503 });
}
```

---

### 15. **Hardcoded Limits: RAG Chunk Size Should Be Configurable**

**File:** `lib/rag.worker.ts:241-244`  
**Issue:** `TARGET_CHUNK_SENTENCES`, `OVERLAP_SENTENCES`, and `MAX_CHUNK_CHARS` are const.

```typescript
const TARGET_CHUNK_SENTENCES = 8; // ~200–400 words per chunk
const OVERLAP_SENTENCES = 4; // 50% overlap
const MAX_CHUNK_CHARS = 2000; // hard cap — prevents embedding OOM
const MIN_CHUNK_CHARS = 80; // skip near-empty chunks
```

**Suggestion:** Make them configurable via worker message:

```typescript
let TARGET_CHUNK_SENTENCES = 8;
let OVERLAP_SENTENCES = 4;
let MAX_CHUNK_CHARS = 2000;

if (action === "CONFIGURE") {
    TARGET_CHUNK_SENTENCES = payload.targetSentences || 8;
    OVERLAP_SENTENCES = payload.overlapSentences || 4;
    MAX_CHUNK_CHARS = payload.maxChars || 2000;
}
```

---

### 16. **Potential XSS: useChat Displays User Input in Error Messages**

**File:** `lib/useChat.ts:354-365`  
**Issue:** User message is directly inserted into assistant message without sanitization.

```typescript
// Line 354-365
if (!activeProviderReady) {
    chatStore.addMessage({ id: Date.now().toString(), role: "user", content: message });
    const hint = providerCtx?.provider === "browser"
        ? "Load a model first — pick one from the welcome screen or use the model selector."
        : providerCtx?.provider === "ollama"
        ? "Ollama isn't connected. Download it from [ollama.com/download](https://ollama.com/download)..."
        : ...
    chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: `⚠️ ${hint}` });
    return;
}
```

**Problem:** If rendering uses `dangerouslySetInnerHTML` or `react-markdown`, malicious markdown could execute scripts.

**Mitigation:** Ensure message rendering uses `<ReactMarkdown>` with `disallowedElements={['script']}` or similar.

---

### 17. **Hardcoded Timeout: Tool Execution at 30s**

**File:** `lib/useAgent.ts:68`  
**Issue:** `TOOL_TIMEOUT_MS = 30_000` is a const.

```typescript
const TOOL_TIMEOUT_MS = 30_000; // 30s max per tool execution
```

**Suggestion:** Make it per-tool or configurable:

```typescript
const TOOL_TIMEOUTS: Record<string, number> = {
    webSearch: 15_000,
    python: 30_000,
    imageGen: 60_000,
    default: 30_000,
};

const timeout = TOOL_TIMEOUTS[toolName] || TOOL_TIMEOUTS.default;
```

---

### 18. **Magic Number: Memory Embedding Dimension 1024**

**File:** `lib/useMemory.ts:70`  
**Issue:** `const DIM = 1024;` is hardcoded.

```typescript
const DIM = 1024;
const vector = new Array(DIM).fill(0);
```

**Suggestion:** Match it to the embedder's actual output dimension to avoid silent mismatches if the model changes.

---

### 19. **Unclear Behavior: Auto-Save Memory Every Exchange**

**File:** `lib/useChat.ts:453-462`  
**Issue:** Comment says "regardless of memory toggle" but this contradicts user expectations.

```typescript
// Line 453-462
// Persistent semantic memory: auto-save every meaningful exchange
// Saves regardless of memory toggle — toggle controls retrieval, not storage
if (full.length > 50 && !full.startsWith("⚠️")) {
    const summary = `Q: ${message.slice(0, 200)}\nA: ${full.slice(0, 500)}`;
    const tags = ["chat", "auto"];
    if (routeUsed === "cloud") tags.push("cloud");
    if (routeUsed === "local") tags.push("local");
    if (deepSearchEnabled) tags.push("search");
    if (hasDocuments) tags.push("rag");
    memory.saveMemory(summary, tags);
}
```

**Problem:** Users expect "memory toggle" to control ALL memory operations, not just retrieval.

**Suggested Fix:** Respect the toggle:

```typescript
if (memoryEnabled && full.length > 50 && !full.startsWith("⚠️")) {
    memory.saveMemory(summary, tags);
}
```

---

## 📊 SUMMARY

| Severity    | Count | Key Issues                                                      |
| ----------- | ----- | --------------------------------------------------------------- |
| 🔴 Critical | 5     | Memory leaks, null deref, race conditions, type mismatches      |
| 🟡 High     | 4     | Promise rejections, context overflow, abort leaks, routing race |
| 🟠 Medium   | 4     | Silent failures, error handling edge cases                      |
| 🟢 Low      | 10    | Code quality, dead code, hardcoded constants, UX clarity        |

**Total Issues Found:** 23

---

## ✅ RECOMMENDED FIXES (Priority Order)

1. **Fix memory leak in useMemory.ts** (Critical #1)
2. **Fix worker resolver cleanup in useRAG.ts** (Critical #2)
3. **Add null checks for providerCtx** (Critical #3)
4. **Validate RAG cached chunks** (Critical #5)
5. **Fix AbortController lifecycle in useCloudAI.ts** (High #8)
6. **Move auto-routing before context gathering** (High #9)
7. **Add finally block for stallWatchdog** (Medium #10)
8. **Fix Storage Manager blocked state** (Medium #13)
9. **Make agent error intervention fire once** (Medium #11)
10. **Respect memory toggle for auto-save** (Low #19)

---

## 🔍 TESTING RECOMMENDATIONS

1. **Load test:** Open 50 tabs with the same RAG file → verify no IndexedDB handle exhaustion
2. **Abort test:** Start generation, click stop 10x rapidly → verify no abort leaks
3. **Worker crash test:** Modify RAG worker to throw after 5s → verify resolver cleanup
4. **Memory toggle test:** Disable memory, send messages → verify nothing saved to IndexedDB
5. **Auto-route test:** Enable routing, send same message 3x → verify no duplicate API calls

---

**End of Report**
