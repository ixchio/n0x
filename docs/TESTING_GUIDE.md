# N0X Testing Guide - Verify All Fixes

Quick guide to test everything works perfectly.

---

## 🚀 Quick Start

```bash
npm run dev
```

Open http://localhost:3000

---

## 1️⃣ Test Local Models (WebLLM)

### Basic Chat

1. Click "Get Started" on landing page
2. Select a FAST model (SmolLM2 360M or Qwen 0.5B)
3. Wait for model to load (~30s)
4. Send message: "Hello, how are you?"
5. ✅ Should get response without crashing

### Test Stop Button

1. Send: "Write a long story about a cat"
2. Click Stop button mid-generation
3. ✅ Should stop cleanly and save partial response
4. Send another message
5. ✅ Should work normally (AbortController was reset)

### Test RAG (Document Upload)

1. Create a test file `test.txt`:
    ```
    The capital of France is Paris.
    Paris has a population of 2.1 million.
    The Eiffel Tower is 330 meters tall.
    ```
2. Upload it via the paperclip icon
3. Wait for "ready" status
4. Ask: "What is the population of Paris?"
5. ✅ Should mention "2.1 million" from the document
6. Ask: "How tall is the Eiffel Tower?"
7. ✅ Should mention "330 meters"

### Test Web Search

1. Toggle "Deep Search" ON (globe icon)
2. Ask: "What is the weather in Tokyo today?"
3. ✅ Should show "⟳ searching the web..."
4. ✅ Should return answer with sources
5. Check response has URLs cited

---

## 2️⃣ Test Cloud API (Free Groq)

### Setup

1. Get free API key from https://console.groq.com
2. Click provider button (top left)
3. Select "Cloud API"
4. Paste API key
5. Select model: `llama-3.3-70b-versatile`

### Test

1. Send: "Explain quantum computing in simple terms"
2. ✅ Should stream response
3. ✅ Should show tokens/sec in toolbar
4. Test stop button (same as above)

### Test Auto-Routing

1. Enable "Auto-Route" toggle
2. Send simple message: "Hi"
3. ✅ Should route to LOCAL (if model loaded)
4. Send complex: "Write a detailed analysis of the Roman Empire"
5. ✅ Should route to CLOUD
6. Check route indicator shows which was used

---

## 3️⃣ Test RAG Edge Cases

### Large PDF

1. Download any multi-page PDF (e.g., academic paper)
2. Upload it
3. ✅ Should index successfully (may take 1-2 min)
4. Ask question about content
5. ✅ Should retrieve relevant chunks

### Binary File (Should Fail Gracefully)

1. Try uploading a `.png` or `.jpg`
2. ✅ Should show: "Binary file... Vector search unavailable..."
3. ✅ App should NOT crash

### Multiple Files

1. Upload 3 different text files
2. ✅ All should appear in RAG panel
3. Ask questions about each
4. ✅ Should retrieve from correct files

### Cache Test

1. Upload `test.txt` again (same file)
2. ✅ Should say "Loading cached vectors..."
3. ✅ Should be INSTANT (no re-embedding)

---

## 4️⃣ Test Web Search (Free - No API Keys)

### Basic Search

1. Toggle Deep Search ON
2. Ask: "Who won the Nobel Prize in Physics 2024?"
3. ✅ Should return answer from SearXNG/Wikipedia/DDG
4. ✅ Should show sources with URLs

### Compare Quality

1. Ask the same question with Deep Search OFF
2. ✅ Should give outdated or generic answer
3. Turn Deep Search ON and ask again
4. ✅ Should give current, accurate answer with sources

### Answer Synthesis Test

1. Ask: "What is TypeScript?"
2. ✅ Should show instant answer at top
3. ✅ Should include excerpts from Wikipedia
4. ✅ Should cite sources

---

## 5️⃣ Test Error Recovery

### Network Error

1. Disconnect Wi-Fi
2. Try to send a message
3. ✅ Should show: "Network error... check internet connection"
4. Reconnect Wi-Fi
5. Send same message
6. ✅ Should work

### Invalid API Key

1. Switch to Cloud API
2. Enter invalid key: "sk-invalid123"
3. Try to generate
4. ✅ Should show: "API error... Check your API key"

### Model OOM (if on low-RAM device)

1. Try loading huge model (Llama 3.3 70B) on 8GB device
2. ✅ Should show: "Hardware Restricted... Try a smaller model"

### Worker Crash Simulation

1. Upload a corrupted file (truncated PDF)
2. ✅ Should fall back to plain text extraction
3. ✅ Should show: "(fallback mode - no vector search)"

---

## 6️⃣ Test Memory System

### Save Memory

1. Toggle "Memory" ON (brain icon)
2. Have a conversation about your favorite food
3. Clear chat (new conversation)
4. Ask: "What's my favorite food?"
5. ✅ Should recall from memory

### Memory Storage

1. Open DevTools → Application → IndexedDB
2. Check `voidchat_memory`
3. ✅ Should see saved memories

---

## 7️⃣ Test Agent Mode

### Enable Agent

1. Toggle "Agent Mode" ON (robot icon)
2. Ask: "Search the web for the current price of Bitcoin and calculate 10% of it"
3. ✅ Should show:
    - Thought: "I need to search..."
    - Action: webSearch(...)
    - Observation: [results]
    - Thought: "Now I'll calculate..."
    - Action: python(...)
    - Final Answer: [result]

### Python Execution

1. With agent ON, ask: "Calculate the first 10 Fibonacci numbers"
2. ✅ Should use Python
3. ✅ Should show numbers

---

## 8️⃣ Test Storage Manager

### Clear Data

1. Click hamburger menu → "Storage Manager"
2. Click "Clear" for "Chat History"
3. Click "Confirm"
4. ✅ Page should reload
5. ✅ Chat history should be empty

### Blocked State (Multi-Tab Test)

1. Open n0x in TWO tabs
2. In Tab 1: Storage Manager → Clear "Chat History"
3. ✅ Should show alert: "Close other tabs and try again"

---

## 9️⃣ Stress Tests

### Rapid Stop/Start

1. Send message
2. Click Stop
3. Immediately send another message
4. Click Stop again
5. Repeat 10 times
6. ✅ Should never crash
7. ✅ AbortController should reset properly

### Multiple File Uploads

1. Upload 5 files quickly (drag & drop)
2. ✅ All should queue and process
3. ✅ No crashes

### Long Conversation

1. Have 50+ message conversation
2. ✅ Context should be trimmed automatically
3. ✅ No memory errors
4. ✅ Responses should still be coherent

---

## ✅ ALL TESTS SHOULD PASS

If any test fails:

1. Check browser console for errors
2. Check `BUG_REPORT.md` - might be a known issue
3. Report new bugs with:
    - What you did
    - What happened
    - Browser console errors

---

## 🎯 Performance Benchmarks

### Expected Performance:

- **Model load time:** 10s (360MB) to 3min (7GB)
- **First token latency:** <500ms local, <200ms cloud
- **Streaming speed:** 10-80 tokens/sec (depends on model/GPU)
- **RAG indexing:** ~1s per 100 pages
- **Web search:** 2-5s total
- **Context gathering:** <1s

### If Slower:

- **WebLLM slow?** → Try smaller model or Cloud API
- **RAG slow?** → First upload is slow, re-uploads are instant (cached)
- **Search slow?** → Check network, some SearXNG instances are slower

---

## 🐛 Known Limitations (NOT Bugs)

1. **WebLLM requires WebGPU** - won't work on old browsers
2. **Large PDFs** - limited to 100 pages to prevent OOM
3. **Binary files** - can't extract text from images (OCR not implemented)
4. **Code execution** - Pyodide has limited package support
5. **Mobile** - large models may crash (use Cloud API instead)

---

## ✨ Everything Works? You're Done!

Your n0x is now:

- ✅ Crash-proof
- ✅ Production-ready RAG
- ✅ Perplexity-level search
- ✅ Bulletproof error handling

Enjoy! 🚀
