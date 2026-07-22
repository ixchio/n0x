"use client";

interface KeyboardShortcutsDialogProps {
    open: boolean;
    onClose: () => void;
}

const SHORTCUTS = [
    ["⌘/Ctrl + K", "Command palette"],
    ["⌘/Ctrl + Shift + N", "New conversation"],
    ["?", "Toggle this help"],
    ["Enter", "Send message"],
    ["Shift + Enter", "New line in input"],
] as const;

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} aria-hidden="true" />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="keyboard-shortcuts-title"
                    className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 id="keyboard-shortcuts-title" className="text-sm font-semibold text-white">
                            Keyboard shortcuts
                        </h3>
                        <button
                            onClick={onClose}
                            aria-label="Close keyboard shortcuts"
                            className="text-zinc-400 hover:text-white"
                        >
                            <span className="text-lg">×</span>
                        </button>
                    </div>
                    <div className="space-y-2 text-xs">
                        {SHORTCUTS.map(([key, description]) => (
                            <div
                                key={key}
                                className="flex items-center justify-between border-b border-zinc-800/50 py-1.5 last:border-0"
                            >
                                <span className="text-zinc-400">{description}</span>
                                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                                    {key}
                                </kbd>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
