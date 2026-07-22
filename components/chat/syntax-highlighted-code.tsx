"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface SyntaxHighlightedCodeProps {
    language: string;
    code: string;
}

export function SyntaxHighlightedCode({ language, code }: SyntaxHighlightedCodeProps) {
    return (
        <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{ margin: 0, padding: 0, background: "transparent" }}
            codeTagProps={{ style: { fontFamily: "'JetBrains Mono', monospace" } }}
        >
            {code}
        </SyntaxHighlighter>
    );
}
