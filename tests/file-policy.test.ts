import { describe, expect, it } from "vitest";
import {
    MAX_EXTRACTED_TEXT_CHARS,
    MAX_RAG_FILE_BYTES,
    getFileExtension,
    limitExtractedText,
    validateRagFile,
} from "@/lib/retrieval/file-policy";

describe("RAG file policy", () => {
    it("normalizes extensions and rejects unsupported files", () => {
        expect(getFileExtension("NOTES.MD")).toBe("md");
        expect(validateRagFile({ name: "archive.zip", size: 10 })).toMatch(/Unsupported file type/);
    });

    it("rejects empty and oversized files", () => {
        expect(validateRagFile({ name: "empty.txt", size: 0 })).toBe("This file is empty.");
        expect(validateRagFile({ name: "large.pdf", size: MAX_RAG_FILE_BYTES + 1 })).toMatch(/25 MB safety limit/);
        expect(validateRagFile({ name: "valid.pdf", size: MAX_RAG_FILE_BYTES })).toBeNull();
    });

    it("truncates extracted text at the documented local limit", () => {
        const short = "unchanged";
        expect(limitExtractedText(short)).toBe(short);

        const oversized = "x".repeat(MAX_EXTRACTED_TEXT_CHARS + 10);
        const limited = limitExtractedText(oversized);
        expect(limited.startsWith("x".repeat(MAX_EXTRACTED_TEXT_CHARS))).toBe(true);
        expect(limited).toContain("[Document truncated at the local safety limit.]");
        expect(limited).not.toContain("x".repeat(MAX_EXTRACTED_TEXT_CHARS + 1));
    });
});
