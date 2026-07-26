// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "@/components/chat/message-bubble";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
    else Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("generated image interactions", () => {
    it("uses private image requests and exposes a keyboard-dismissable modal preview", () => {
        render(<MessageBubble role="assistant" content="" image="https://images.example/generated.png" />);

        const image = screen.getByAltText("Generated") as HTMLImageElement;
        expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
        fireEvent.load(image);

        const opener = screen.getByRole("button", { name: "Open generated image preview" });
        fireEvent.click(opener);

        expect(screen.getByRole("dialog", { name: "Generated image preview" })).toBeTruthy();
        expect(document.body.style.overflow).toBe("hidden");

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog", { name: "Generated image preview" })).toBeNull();
        expect(document.body.style.overflow).toBe("");
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open generated image preview" }));
    });

    it("downloads through a blob URL instead of navigating the workspace", async () => {
        const fetchImage = vi.fn(async () => ({
            ok: true,
            status: 200,
            blob: async () => new Blob(["image"], { type: "image/png" }),
        }));
        vi.stubGlobal("fetch", fetchImage);
        Object.defineProperty(URL, "createObjectURL", {
            configurable: true,
            writable: true,
            value: vi.fn(() => "blob:n0x-download"),
        });
        Object.defineProperty(URL, "revokeObjectURL", {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
        const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

        render(
            <MessageBubble role="assistant" content="" image="https://images.example/generated.png" timestamp={123} />
        );
        fireEvent.load(screen.getByAltText("Generated"));
        fireEvent.click(screen.getByRole("button", { name: "Download generated image" }));

        await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
        expect(fetchImage).toHaveBeenCalledWith("https://images.example/generated.png", {
            referrerPolicy: "no-referrer",
        });
    });
});
