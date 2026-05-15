# Browser LLM Inference — State of the Art (May 2026)

Research compiled from: WebLLM paper (arXiv:2412.15803), CMU thesis (CMU-CS-25-112),
WebGPU dispatch overhead paper (arXiv:2604.02344), and 15+ industry sources.

---

## 1. THE HARD LIMITS (what the browser cannot escape)

### Memory Ceiling
| Device Class | Available GPU Memory | Max Model (4-bit) | Expected Decode |
|---|---|---|---|
| Integrated GPU (Intel Iris) | 2–4 GB shared | 1.5B | 5–15 tok/s |
| Apple M1/M2 (unified memory) | 4–6 GB usable | 3B comfortable, 7B tight | 25–46 tok/s |
| Apple M3 Max (unified) | 8–12 GB usable | 8B comfortable | 41–71 tok/s |
| Discrete NVIDIA (8GB VRAM) | 6–7 GB usable | 7B tight | 45–51 tok/s |
| Safari (Metal per-buffer limit) | 256MB (old iPhone) to 993MB (iPad Pro) | 0.5B–1B on mobile | 3–10 tok/s |

**Key formula**: 4-bit quantized model weight memory ≈ `(params × 0.5 bytes) + KV cache overhead`
- 1B model: ~500MB weights + ~200MB KV/runtime = ~700MB
- 3B model: ~1.5GB weights + ~400MB KV/runtime = ~1.9GB  
- 7B model: ~3.5GB weights + ~800MB KV/runtime = ~4.3GB

**Browser tax**: Chrome/Edge consume ~200–500MB of GPU memory themselves. The browser sandbox also adds latency for every GPU dispatch call.

### WebGPU Dispatch Overhead (arXiv:2604.02344 — April 2026)
This paper benchmarked dispatch overhead across 4 GPU vendors × 3 browsers × 3 backends:

| Browser | Backend | Dispatch Overhead (μs) | Decode: Qwen2.5-0.5B | Decode: Qwen2.5-1.5B |
|---|---|---|---|---|
| Chrome 144 (Win) | D3D12 | ~30 | 51.1 tok/s | 45.7 tok/s |
| Chrome 143 (Mac) | Metal | ~25 | 46.4 tok/s | 36.0 tok/s |
| Safari 26.2 (Mac) | Metal | ~32 | 41.7 tok/s | 29.7 tok/s |
| Firefox 147 (Win) | D3D12 | ~45 | 9.1 tok/s | 9.1 tok/s |
| Firefox 147 (Mac) | Metal | ~45 | 9.6 tok/s | 9.6 tok/s |

**Critical finding**: Firefox is 4–5× slower than Chrome for LLM decode due to higher dispatch overhead. Safari on Metal is competitive with Chrome. The dominant factor is backend choice (Vulkan vs Metal), not browser.

**WeInfer**: Reports 3.76× speedup over baseline WebLLM via buffer reuse and async pipelines (Chen et al., 2025). This is the biggest single optimization opportunity — reuse GPU buffers instead of allocating new ones each forward pass.

### WebGPU vs Native Performance Gap
WebLLM retains **80% of native MLC-LLM performance** on the same device (arXiv:2412.15803).
- M3 Max: 41 tok/s (WebGPU) vs ~51 tok/s (native Metal) for Llama 3.1 8B q4
- The 20% gap comes from: WebGPU→Metal shader translation overhead, lack of custom memory allocators, dispatch overhead per compute pass
- Gap is expected to narrow as WebGPU matures (browser vendors are actively optimizing)

---

## 2. WHAT WEBLLM ACTUALLY DOES UNDER THE HOOD

From the WebLLM paper (arXiv:2412.15803, December 2024) and CMU thesis (May 2025):

### Architecture
```
User Code (JS/TS)
    ↓ OpenAI-compatible API
WebLLM Runtime (TypeScript)
    ↓ postMessage
Web Worker (keeps UI at 60fps)
    ↓
┌─────────────────────────────────┐
│  MLC-LLM compiled model library │
│  ┌───────────┐ ┌──────────────┐ │
│  │ WGSL GPU  │ │ WASM CPU     │ │
│  │ Kernels   │ │ (grammar,    │ │
│  │ (attention│ │  KV-cache    │ │
│  │  GEMM,    │ │  management, │ │
│  │  softmax) │ │  tokenizer)  │ │
│  └───────────┘ └──────────────┘ │
└─────────────────────────────────┘
    ↓                    ↓
  WebGPU API          WebAssembly
    ↓
  Native GPU (Metal/Vulkan/D3D12)
```

### Key Optimizations Already in WebLLM
1. **PagedAttention via WGSL** — KV cache split into pages, managed by WASM. Same algorithm as vLLM but compiled to WebGPU shaders.
2. **FlashAttention in WGSL** — Tiled attention with shared memory, compiled from MLC-LLM.
3. **Kernel Fusion** — Apache TVM fuses multiple operations (LayerNorm + attention + FFN) into single GPU dispatches, reducing dispatch overhead.
4. **GEMM Tiling** — Matrix multiply is tiled and optimized for WebGPU workgroup sizes.
5. **XGrammar (Structured Generation)** — Grammar-constrained decoding compiled to WASM, enabling JSON mode with near-zero overhead.
6. **Model Weight Caching** — Weights cached in browser Cache API. Second visit = zero download, just shader compilation + context setup.

### What WebLLM Does NOT Do (opportunities)
- **No speculative decoding** — Every token is a full forward pass
- **No KV cache quantization** — KV cache is full FP16, eating memory
- **No dynamic batching** — Single request at a time (browser = single user)
- **No prefix caching** — Same system prompt recomputed every conversation
- **No layer-wise streaming** — All-or-nothing model download
- **No CPU offloading of KV cache** — Everything stays in GPU memory

---

## 3. TECHNIQUES THAT WOULD MAKE N0X FASTER (implementable)

### A. Prefix Caching (High Impact, Medium Effort)
**Problem**: Every message recomputes KV cache for the system prompt + conversation history.
**Solution**: Cache the KV state for the system prompt. When conversation starts, skip the first N tokens of prefill.
**Expected gain**: 30–50% reduction in time-to-first-token for messages after the first.
**How**: WebLLM's `MLCEngine` exposes the chat state. After computing system prompt KV cache once, clone it for each new message. MLC-LLM already supports prefix caching natively — need to verify if the WASM runtime exposes this.

### B. KV Cache Quantization (High Impact, Hard)
**Problem**: KV cache in FP16 eats ~200MB for 1.5B model at 4k context. For 7B model, ~800MB.
**Solution**: Quantize KV cache to INT4 or INT8, reducing memory by 2–4×.
**Expected gain**: Fit 7B model where only 3B fits today. Or run 3B with 8k+ context.
**Papers**:
- **KIVI** (2024): 2-bit KV cache quantization with minimal accuracy loss
- **TurboQuant** (Google, 2025): Online vector quantization for KV with near-zero overhead
- **QuantSpec** (2025): Self-speculative decoding + hierarchical KV quantization = 2.88× throughput
**How**: This requires changes to the MLC-LLM compilation step (compile model with INT8 KV cache support). Not directly implementable in n0x without modifying MLC-LLM.

### C. Speculative Decoding with Self-Draft (High Impact, Hard)
**Problem**: Each token requires a full forward pass through all layers.
**Solution**: Use early exit / layer skip to draft tokens cheaply, then verify with full model in one pass.
**Papers**:
- **CLaSp** (May 2025): In-context layer skip for self-speculative decoding — skips middle layers for draft, uses hidden state feedback to optimize which layers to skip
- **QuantSpec** (Feb 2025): Use quantized version of same model as draft
- **Component-Aware Self-Spec** (2025): Exploit hybrid model architectures (Mamba+Attention)
**Expected gain**: 1.5–2.5× decode throughput
**How**: Would need MLC-LLM to compile two execution paths (full + skip). Theoretically possible via TVM but significant engineering.

### D. Buffer Reuse / Memory Pool (Medium Impact, Medium Effort)  
**Problem**: WebGPU buffer allocation is expensive. Each forward pass allocates intermediate buffers.
**Solution**: Pre-allocate a memory pool, reuse buffers across forward passes.
**Reference**: WeInfer achieves 3.76× over WebLLM via buffer reuse + async pipeline.
**How**: Would require forking/patching MLC-LLM's WebGPU runtime. The TVM compiled code manages buffers — this is low-level.

### E. Async Prefill Pipeline (Medium Impact, Medium Effort)
**Problem**: Prefill (processing the prompt) blocks decode (generating tokens).
**Solution**: Pipeline prefill chunks and start decode before full prefill completes.
**Expected gain**: 20–40% reduction in time-to-first-token for long prompts.
**How**: Split long prompts into chunks, process first chunk, start generating, continue prefill in background.

### F. Progressive Model Loading (UX Impact, Medium Effort)
**Problem**: 1–2 GB download before ANY response. Users leave.
**Solution**: Download model shards progressively. Start inference with first shard while rest downloads.
**Limitation**: MLC-LLM compiles models as monolithic blobs. True progressive loading requires model-level sharding where early layers can run independently.
**Realistic alternative**: Keep the tiny SmolLM2 360M (~200MB) pre-cached via Service Worker. When user loads a bigger model, route to the small model for immediate responses while the big model downloads in background. Switch seamlessly when ready.

---

## 4. TECHNIQUES THAT ARE ACTUALLY NOVEL (breakthrough territory)

### I. Hybrid Local-Cloud Routing (Nobody does this in-browser)
**Architecture**:
```
User sends message
    ↓
Complexity Classifier (runs on SmolLM2 0.5B, ~5ms)
    ↓
Simple task (grammar, yes/no, summarize)  →  Run on local 1.5B model (instant, private)
Complex task (code, reasoning, analysis)  →  Route to Cloud API (Groq, 70B quality)
    ↓
User gets best-quality response with no manual switching
```

**Why it's novel**: Existing tools are either 100% local or 100% cloud. n0x can be the first browser tool that AUTOMATICALLY routes based on task complexity. The classifier is a simple prompt scored by token probability — doesn't even need a separate model.

**Implementation**: Score the prompt against a few patterns:
- Short question + few tokens expected → local
- "explain", "write code", "analyze" + long context → cloud  
- Falls back to user's default if ambiguous

### II. Cross-Encoder Reranking in RAG (Nobody does this in-browser)
**Current n0x RAG**: BM25 + vector → RRF fusion → MMR (already good)
**Upgrade**: Add a tiny cross-encoder pass (~50ms with MiniLM) that scores query-document pairs with FULL attention, not just embedding similarity.
**Why it matters**: Cross-encoder reranking improves RAG precision by 15–30% on standard benchmarks. It's universally used server-side but nobody runs it in a browser Web Worker.
**How**: Load `cross-encoder/ms-marco-MiniLM-L-6-v2` (~80MB) alongside the existing embedding model. After RRF fusion, score top-10 candidates through cross-encoder, return top-3.

### III. Persistent Semantic Memory (IndexedDB vector store)
**Current n0x memory**: Stores raw text snippets in IndexedDB.
**Upgrade**: Every conversation → chunked → embedded → stored as vectors in IndexedDB. On every new prompt, run similarity search over ALL past conversations. Inject relevant memories into context automatically.
**Why it's novel**: Turns a stateless browser session into an AI that remembers you across weeks. No cloud needed. The embeddings are already computed by the RAG pipeline (MiniLM) — just store them permanently.

---

## 5. PERFORMANCE BENCHMARKS — WHAT'S REALISTIC

### Current State (WebLLM, May 2026)
| Model | Hardware | Decode Speed | Notes |
|---|---|---|---|
| Qwen 3.5 0.8B (INT4) | M3 Max | 180 tok/s | Hand-tuned WGSL shaders |
| Phi 3.5 Mini (q4f16) | M3 Max | 71 tok/s | Standard WebLLM |
| Llama 3.1 8B (q4f16) | M3 Max | 41 tok/s | Standard WebLLM |
| Qwen2.5 1.5B (q4f16) | RTX PRO 2000 | 45.7 tok/s | Chrome/D3D12 |
| Qwen2.5 0.5B (q4f16) | Apple M2 | 46.4 tok/s | Chrome/Metal |
| Llama 3.2 3B | Transformers.js v4 | ~60 tok/s | C++ rewrite + WebGPU |
| Llama 3.2 1B | Chrome WebGPU | ~10 tok/s | Simon Willison demo |

### Transformers.js v4 (Feb 2026) — Alternative Runtime
Hugging Face rewrote Transformers.js in C++ with native WebGPU backend:
- 3–10× faster than v3
- 53% smaller build
- Supports 200+ model architectures, 1200+ converted models
- Llama 3.2 3B at ~60 tok/s
- Could be an alternative to WebLLM for n0x in the future

### Target Performance for "Daily Use"
| Metric | Minimum | Good | Excellent |
|---|---|---|---|
| Time to first token | <3s | <1s | <500ms |
| Decode speed | 10 tok/s | 25 tok/s | 50+ tok/s |
| Model load (cached) | <5s | <2s | <1s |
| Model load (first) | <120s | <60s | <30s |

---

## 6. WHAT N0X SHOULD ACTUALLY DO (prioritized roadmap)

### Phase 1: Maximize What Exists (1–2 weeks)
1. **Pre-cache SmolLM2 360M via Service Worker** — Instant fallback model, always available offline
2. **WebGPU shader pre-warm** — Call `requestDevice()` on page load, before user types
3. **System prompt KV prefix caching** — If WebLLM supports it, cache the system prompt computation
4. **Battery-aware throttling** — Reduce inference priority when tab is backgrounded (`document.visibilityState`)
5. **Mobile GPU cap** — Auto-select 0.5B on mobile (detect `navigator.userAgentData.mobile`)

### Phase 2: Novel Features (2–4 weeks)
6. **Hybrid local-cloud routing** — Complexity classifier → route simple to local, complex to cloud
7. **Cross-encoder RAG reranking** — 80MB MiniLM cross-encoder pass after hybrid search
8. **Persistent semantic memory** — Embed all conversations, store vectors in IndexedDB, auto-recall

### Phase 3: Deep Optimization (requires MLC-LLM changes)
9. **KV cache quantization** — INT8 KV cache via modified MLC-LLM compilation
10. **Speculative self-decoding** — Layer skip for draft tokens
11. **Buffer reuse pool** — WeInfer-style memory optimization
12. **Progressive model loading** — Shard-based download with early inference

---

## 7. KEY PAPERS AND REFERENCES

1. **WebLLM**: Ruan et al., "WebLLM: A High-Performance In-Browser LLM Inference Engine", arXiv:2412.15803, Dec 2024
2. **CMU Thesis**: Ruan, "Democratizing On-Device LLM Inference with ML Compilers and Web Technologies", CMU-CS-25-112, May 2025
3. **WebGPU Dispatch**: "Characterizing WebGPU Dispatch Overhead for LLM Inference Across Four GPU Vendors", arXiv:2604.02344, April 2026
4. **PagedAttention**: Kwon et al., "Efficient Memory Management for LLM Serving with PagedAttention", SOSP 2023
5. **CLaSp**: Chen et al., "In-Context Layer Skip for Self-Speculative Decoding", arXiv:2505.24196, May 2025
6. **QuantSpec**: "When Speculative Decoding Meets Hierarchical KV Cache Quantization", arXiv:2502.10424, Feb 2025
7. **TurboQuant**: Zandieh et al., "Online Vector Quantization with Near-optimal Distortion Rate", arXiv:2504.19874, 2025
8. **KIVI**: "2-bit Quantized KV for Batch Size Expansion", 2024
9. **AWQ**: Lin et al., "Activation-aware Weight Quantization for LLM Compression", MLSys 2024 Best Paper
10. **Split Inference**: "Privacy-Aware Split Inference with Speculative Decoding for LLMs over WANs", arXiv:2602.16760, Feb 2026
11. **WeInfer**: Chen et al., 2025 — 3.76× over WebLLM via buffer reuse and async pipelines
12. **Transformers.js v4**: Hugging Face, Feb 2026 — C++ rewrite with WebGPU, 3–10× over v3

---

*Last updated: May 2026. Sources verified against arxiv, GitHub, and industry benchmarks.*
