export const MAX_RAG_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_DOCX_EXPANDED_BYTES = 32 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 750_000;

export const SUPPORTED_RAG_EXTENSIONS = new Set([
    "pdf",
    "docx",
    "txt",
    "md",
    "json",
    "csv",
    "html",
    "htm",
    "xml",
    "log",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "rst",
    "tex",
]);

export function getFileExtension(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function validateRagFile(file: Pick<File, "name" | "size">): string | null {
    if (!file.name || file.name.length > 255) return "The file name is missing or too long.";
    const extension = getFileExtension(file.name);
    if (!SUPPORTED_RAG_EXTENSIONS.has(extension)) {
        return `Unsupported file type “.${extension || "unknown"}”. Use PDF, DOCX, text, Markdown, CSV, HTML, JSON, or a text-based config file.`;
    }
    if (file.size <= 0) return "This file is empty.";
    if (file.size > MAX_RAG_FILE_BYTES) {
        return `“${file.name}” is larger than the 25 MB safety limit. Split it into smaller files before uploading.`;
    }
    return null;
}

export function limitExtractedText(text: string): string {
    if (text.length <= MAX_EXTRACTED_TEXT_CHARS) return text;
    return `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[Document truncated at the local safety limit.]`;
}
