const ARTIFACT_CSP = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "font-src data:",
    "form-action 'none'",
    "frame-src 'none'",
    "img-src data: blob:",
    "media-src data: blob:",
    "object-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
].join("; ");

function applyArtifactSandboxPolicy(html: string): string {
    const guard = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}"><meta name="referrer" content="no-referrer">`;
    // Keep the policy before every byte of model-generated markup. Regex-based
    // insertion can be confused by a fake <head> inside a comment or script.
    // Nested document tags are harmless in HTML parsing; the outer policy stays
    // authoritative and additional CSP policies can only make it stricter.
    return `<!DOCTYPE html><html><head>${guard}</head><body>${html}</body></html>`;
}

/**
 * Builds an opaque-origin preview document whose CSP blocks ordinary network
 * subresources, connections, forms, objects, and nested frames. The iframe
 * still needs `allow-scripts` for local demos; hostile code can consume
 * resources or attempt to navigate its own frame, so this is not an air gap.
 */
export function buildSandboxHtml(code: string, lang: string): string {
    const language = lang.toLowerCase();

    if (language === "javascript" || language === "js") {
        return applyArtifactSandboxPolicy(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { background:#0a0a0a; color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:12px; margin:0; font-size:13px; }
pre { white-space:pre-wrap; word-break:break-word; margin:0; font-family:"JetBrains Mono",monospace; }
.err { color:#ef4444; }
</style></head><body><pre id="out"></pre><script>
const _log=console.log, _err=console.error, out=document.getElementById('out');
console.log=(...a)=>{out.textContent+=a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')+'\\n';_log(...a);};
console.error=(...a)=>{const s=document.createElement('span');s.className='err';s.textContent=a.join(' ')+'\\n';out.appendChild(s);_err(...a);};
try{${code}}catch(e){console.error(e.message)}
</script></body></html>`);
    }

    if (language === "css") {
        return applyArtifactSandboxPolicy(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#0a0a0a;margin:0;padding:20px;font-family:sans-serif;color:#e0e0e0}
${code}
</style></head><body>
<div class="demo"><h2>CSS Preview</h2><p>This is a paragraph.</p><button>Button</button><a href="#">Link</a>
<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul></div>
</body></html>`);
    }

    if (language === "html" || language === "htm") {
        const hasDocumentRoot = /<!doctype|<html(?:\s|>)/i.test(code);
        if (hasDocumentRoot) return applyArtifactSandboxPolicy(code);
        return applyArtifactSandboxPolicy(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{background:#0a0a0a;color:#e0e0e0;font-family:sans-serif;margin:0;padding:16px}</style>
<script>window.onerror=function(m){document.body.textContent='Runtime error: '+m;}</script>
</head><body>${code}</body></html>`);
    }

    return "";
}
