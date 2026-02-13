"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { ChevronDown, Loader2, Zap, Brain, Code, Shield, Volume2, VolumeX, Cpu, Menu, AlertTriangle, Download } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { MessageBubble } from "@/components/message-bubble";
import { ChatInput } from "@/components/chat-input";
import { AgentThinking } from "@/components/agent-thinking";
import { MemoryPanel } from "@/components/memory-panel";
import { WEBLLM_MODELS, MODEL_CATEGORIES } from "@/lib/useWebLLM";
import { cn } from "@/lib/utils";
import { CommandMenu } from "@/components/command-menu";
import { RAGPanel } from "@/components/rag-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { PersonaSelector } from "@/components/persona-selector";
import { ShareMenu } from "@/components/share-menu";
import { useChat } from "@/lib/useChat";

function ChatPageInner() {
  const chat = useChat();
  const {
    input, setInput, streamingContent, isStreaming, generatingImage, imageProgress,
    deepSearchEnabled, setDeepSearchEnabled, memoryEnabled, setMemoryEnabled,
    webllm, deepSearch, memory, pyodide, tts, rag, chatStore, persona,
    handleSend, handleNewChat, handlePythonRun,
  } = chat;

  const [headerModelOpen, setHeaderModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [pyEnabled, setPyEnabled] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const DEFAULT_MODEL = "SmolLM2-360M-Instruct-q4f16_1-MLC";

  // Auto-load smallest model on first visit
  useEffect(() => {
    webllm.init();
    tts.init();
  }, []);

  useEffect(() => {
    if (webllm.isSupported && webllm.status === "unloaded" && !webllm.loadedModel) {
      const timer = setTimeout(() => webllm.loadModel(DEFAULT_MODEL), 500);
      return () => clearTimeout(timer);
    }
  }, [webllm.isSupported, webllm.status, webllm.loadedModel]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && !userScrolledUpRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatStore.messages, streamingContent, deepSearch.phase, deepSearch.streamingText]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distanceFromBottom > 150;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const handleModelChange = useCallback(async (modelId: string) => {
    setHeaderModelOpen(false);
    if (webllm.loadedModel !== modelId) {
      await webllm.loadModel(modelId);
    }
  }, [webllm]);

  const onNewChat = useCallback(() => {
    setIsExploding(true);
    setTimeout(() => {
      handleNewChat();
      setIsExploding(false);
    }, 400);
  }, [handleNewChat]);

  return (
    <div className="h-screen flex bg-crt-black font-mono overflow-hidden text-txt-primary">
      <CommandMenu
        onLoadModel={handleModelChange}
        onNewChat={onNewChat}
        ttsEnabled={tts.isEnabled}
        onToggleTTS={() => tts.setEnabled(!tts.isEnabled)}
        ragEnabled={rag.ragEnabled}
        onToggleRAG={rag.toggle}
      />
      <RAGPanel />
      <Sidebar isOpen={sidebarOpen} currentModel={webllm.loadedModel} onNewChat={onNewChat} />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-11 border-b border-crt-border flex items-center px-4 shrink-0 bg-crt-bg">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-3 text-txt-tertiary hover:text-phosphor transition-colors">
            <Menu className="w-4 h-4" />
          </button>

          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => setHeaderModelOpen(!headerModelOpen)}
              className="flex items-center gap-2 text-xs font-mono text-txt-secondary hover:text-phosphor transition-colors"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label || "no model"}</span>
              <ChevronDown className={cn("w-3 h-3 opacity-40 transition-transform", headerModelOpen && "rotate-180")} />
            </button>

            {headerModelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHeaderModelOpen(false)} />
                <div className="absolute top-full left-0 mt-2 w-72 max-h-[70vh] overflow-y-auto bg-crt-surface border border-crt-border rounded z-50 no-scrollbar">
                  {Object.entries(MODEL_CATEGORIES).map(([key, cat]) => {
                    const models = WEBLLM_MODELS.filter(m => m.category === key);
                    if (models.length === 0) return null;
                    return (
                      <div key={key} className="p-1">
                        <div className="px-2 py-1.5 flex items-center gap-2">
                          {key === 'fast' && <Zap className="w-3 h-3 text-neon-amber" />}
                          {key === 'balanced' && <Cpu className="w-3 h-3 text-neon-cyan" />}
                          {key === 'powerful' && <Brain className="w-3 h-3 text-neon-magenta" />}
                          {key === 'coding' && <Code className="w-3 h-3 text-phosphor" />}
                          {key === 'uncensored' && <Shield className="w-3 h-3 text-neon-pink" />}
                          <span className="text-[10px] font-mono text-txt-tertiary uppercase tracking-wider">
                            {cat.label}
                          </span>
                        </div>
                        {models.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => handleModelChange(m.id)}
                            disabled={!webllm.isSupported}
                            className={cn(
                              "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-all font-mono",
                              webllm.loadedModel === m.id
                                ? "bg-phosphor-faint text-phosphor border border-phosphor-dim"
                                : "text-txt-secondary hover:bg-crt-hover hover:text-phosphor"
                            )}
                          >
                            <div>
                              <div>{m.label}</div>
                              <div className="text-[10px] text-txt-tertiary">{m.desc}</div>
                            </div>
                            <span className="text-[10px] text-txt-tertiary">{m.size}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Only show these controls when NOT loading */}
          {webllm.status !== "loading" && (
            <>
              {/* Persona */}
              <div className="ml-3">
                <PersonaSelector compact />
              </div>

              {/* TTS */}
              <button
                onClick={() => tts.setEnabled(!tts.isEnabled)}
                className={cn("ml-3 p-1 rounded transition-all", tts.isEnabled ? "text-phosphor" : "text-txt-tertiary hover:text-txt-secondary")}
              >
                {tts.isEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* TPS */}
              {webllm.stats.tps > 0 && (
                <div className={cn(
                  "ml-3 font-mono text-[11px] flex items-center gap-1",
                  webllm.stats.tps > 50 ? "text-phosphor text-glow-sm" :
                    webllm.stats.tps > 20 ? "text-phosphor-dim" : "text-txt-tertiary"
                )}>
                  <Zap className="w-3 h-3" />
                  {webllm.stats.tps} t/s
                </div>
              )}

              {/* Share */}
              <div className="ml-3">
                <ShareMenu messages={chatStore.messages} modelName={WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label} />
              </div>
            </>
          )}

          {/* Loading — show only spinner + progress */}
          {webllm.status === "loading" && (
            <div className="ml-auto text-[11px] font-mono text-phosphor-dim flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {Math.round(webllm.loadProgress * 100)}%
            </div>
          )}

          <div className="ml-auto text-[10px] text-txt-tertiary font-mono">ctrl+k</div>
        </header>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
          {/* WebGPU not supported banner */}
          {!webllm.isSupported && (
            <div className="max-w-lg mx-auto mt-12">
              <div className="bg-red-500/10 border border-red-500/30 rounded p-5 text-center space-y-3">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <h3 className="text-sm font-mono text-red-400 font-bold">WebGPU not available</h3>
                <p className="text-xs text-txt-secondary font-mono leading-relaxed">
                  your browser doesn't support WebGPU yet. N0X needs it to run AI models locally.
                </p>
                <div className="text-[11px] text-txt-tertiary font-mono space-y-1">
                  <p>✅ Chrome 113+ or Edge 113+</p>
                  <p>⚠️ Firefox — enable <code className="text-phosphor-dim">dom.webgpu.enabled</code> in about:config</p>
                  <p>⚠️ Safari 17+ — macOS Sonoma / iOS 17 only</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading screen */}
          {webllm.isSupported && webllm.status === "loading" && chatStore.messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="space-y-6 text-center max-w-sm">
                <h2 className="font-pixel text-xl text-phosphor text-glow tracking-wider">N0X</h2>

                {/* Progress bar */}
                <div className="w-64 mx-auto">
                  <div className="h-1.5 bg-crt-surface rounded-full overflow-hidden border border-crt-border">
                    <div
                      className="h-full bg-phosphor rounded-full transition-all duration-300 shadow-glow-sm"
                      style={{ width: `${Math.round(webllm.loadProgress * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-txt-tertiary font-mono">
                      downloading {WEBLLM_MODELS.find(m => m.id === (webllm.loadingModel || webllm.loadedModel || DEFAULT_MODEL))?.label || "model"}
                    </span>
                    <span className="text-[10px] text-phosphor-dim font-mono">
                      {Math.round(webllm.loadProgress * 100)}%
                    </span>
                  </div>
                </div>

                {/* First-time tips */}
                <div className="space-y-2 pt-2">
                  <p className="text-[11px] text-txt-secondary font-mono">
                    first time? this downloads once, then it's instant forever.
                  </p>
                  <p className="text-[10px] text-txt-tertiary font-mono">
                    the model weights are cached in your browser —<br />
                    no server, no account, everything stays on your machine.
                  </p>
                  <p className="text-[10px] text-txt-tertiary font-mono opacity-60">
                    don't refresh — download will restart
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Welcome screen (model loaded, no messages) */}
          {webllm.isSupported && chatStore.messages.length === 0 && !deepSearch.isActive && webllm.status !== "loading" ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="space-y-6 text-center max-w-sm">
                <h2 className="font-pixel text-xl text-phosphor text-glow tracking-wider">N0X</h2>
                <p className="text-xs text-txt-tertiary font-mono">
                  {webllm.status === "unloaded" ? "select a model to start · ctrl+k for commands" : "ready. type something."}
                </p>

                {webllm.status === "unloaded" && (
                  <div className="grid grid-cols-3 gap-2 pt-4">
                    <button
                      onClick={() => handleModelChange("SmolLM2-360M-Instruct-q4f16_1-MLC")}
                      className="p-3 rounded bg-crt-surface border border-phosphor-dim hover:border-phosphor transition-all text-left group relative"
                    >
                      <div className="absolute -top-2 right-2 text-[8px] bg-phosphor text-crt-black px-1.5 py-0.5 rounded font-mono font-bold">recommended</div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Zap className="w-3 h-3 text-neon-amber" />
                        <span className="text-[11px] text-txt-secondary group-hover:text-phosphor">SmolLM2</span>
                      </div>
                      <div className="text-[10px] text-txt-tertiary">fast · 250mb</div>
                    </button>

                    <button
                      onClick={() => handleModelChange("Qwen2.5-1.5B-Instruct-q4f16_1-MLC")}
                      className="p-3 rounded bg-crt-surface border border-crt-border hover:border-phosphor-dim transition-all text-left group"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Brain className="w-3 h-3 text-neon-cyan" />
                        <span className="text-[11px] text-txt-secondary group-hover:text-phosphor">Qwen 1.5B</span>
                      </div>
                      <div className="text-[10px] text-txt-tertiary">balanced · 1gb</div>
                    </button>

                    <button
                      onClick={() => handleModelChange("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC")}
                      className="p-3 rounded bg-crt-surface border border-crt-border hover:border-phosphor-dim transition-all text-left group"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Code className="w-3 h-3 text-phosphor" />
                        <span className="text-[11px] text-txt-secondary group-hover:text-phosphor">Coder</span>
                      </div>
                      <div className="text-[10px] text-txt-tertiary">code · 1gb</div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={cn("max-w-3xl mx-auto space-y-5 transition-all", isExploding && "opacity-0 scale-95")}>
              {chatStore.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  image={msg.image}
                  onRunCode={(pyodide.isReady && pyEnabled) ? handlePythonRun : undefined}
                />
              ))}

              {deepSearch.isActive && (
                <AgentThinking
                  phase={deepSearch.phase as any}
                  query={deepSearch.query}
                  results={deepSearch.results}
                  readingUrl={deepSearch.currentUrl}
                  streamingText={deepSearch.streamingText}
                  isActive={deepSearch.isActive}
                />
              )}

              {generatingImage && (
                <div className="flex items-center gap-3 p-3 bg-crt-surface border border-crt-border rounded text-xs font-mono">
                  <Loader2 className="w-4 h-4 text-phosphor animate-spin" />
                  <div>
                    <span className="text-txt-secondary">generating image</span>
                    {imageProgress.phase && (
                      <span className="text-txt-tertiary ml-2">· {imageProgress.phase}</span>
                    )}
                  </div>
                </div>
              )}

              {streamingContent && (
                <MessageBubble role="assistant" content={streamingContent} />
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="max-w-3xl mx-auto w-full">
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={handleSend}
            isStreaming={isStreaming}
            deepSearchEnabled={deepSearchEnabled}
            toggleDeepSearch={() => setDeepSearchEnabled(!deepSearchEnabled)}
            memoryEnabled={memoryEnabled}
            toggleMemory={() => {
              setMemoryEnabled(!memoryEnabled);
              if (!memoryEnabled) setShowMemoryPanel(true);
            }}
            ragEnabled={rag.ragEnabled}
            toggleRag={rag.toggle}
            pyodideReady={pyodide.isReady}
            pyodideLoading={pyodide.isLoading}
            pyodideEnabled={pyEnabled}
            onPyodideLoad={pyodide.load}
            onPyodideToggle={setPyEnabled}
            onFileDrop={rag.addFile}
          />
        </div>
      </main>

      <MemoryPanel
        isOpen={showMemoryPanel}
        onClose={() => setShowMemoryPanel(false)}
        memories={memory.memories}
        onSave={memory.saveMemory}
        onDelete={memory.deleteMemory}
        onSearch={memory.searchMemories}
      />
    </div>
  );
}

// Wrap in ErrorBoundary
export default function ChatPage() {
  return (
    <ErrorBoundary>
      <ChatPageInner />
    </ErrorBoundary>
  );
}
