// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryPanel } from "@/components/chat/memory-panel";
import { StorageDurabilityAlert } from "@/components/chat/workbench/storage-durability-alert";

afterEach(cleanup);

describe("storage durability feedback", () => {
    it("announces chat and memory risks without echoing underlying content", () => {
        render(
            <StorageDurabilityAlert
                chatError="secret prompt that must not be announced"
                memoryError="private memory that must not be announced"
            />
        );

        const alert = screen.getByRole("alert");
        expect(alert.getAttribute("aria-live")).toBe("assertive");
        expect(alert.textContent).toMatch(/conversation changes may not survive a reload/i);
        expect(alert.textContent).toMatch(/memory changes were not saved/i);
        expect(alert.textContent).not.toMatch(/secret prompt|private memory/i);
    });

    it("keeps memory input intact until a successful storage commit", async () => {
        let finishSave!: (result: unknown) => void;
        const onSave = vi.fn(
            () =>
                new Promise(resolve => {
                    finishSave = resolve;
                })
        );

        render(
            <MemoryPanel
                isOpen
                onClose={vi.fn()}
                memories={[]}
                onSave={onSave}
                onDelete={vi.fn()}
                onSearch={() => []}
            />
        );

        const input = screen.getByLabelText("New memory") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "keep until durable" } });
        fireEvent.click(screen.getByRole("button", { name: "Save memory" }));

        expect(input.value).toBe("keep until durable");
        expect(input.disabled).toBe(true);

        await act(async () => finishSave({ id: "memory-1" }));
        await waitFor(() => expect(input.value).toBe(""));
    });

    it("keeps failed save text available for retry and reports failed deletes", async () => {
        const memory = {
            id: "memory-1",
            content: "sensitive memory",
            embedding: [],
            timestamp: Date.now(),
            tags: [],
        };
        const onSave = vi.fn().mockResolvedValue(null);
        const onDelete = vi.fn().mockResolvedValue(false);

        render(
            <MemoryPanel
                isOpen
                onClose={vi.fn()}
                memories={[memory]}
                onSave={onSave}
                onDelete={onDelete}
                onSearch={() => []}
            />
        );

        const input = screen.getByLabelText("New memory") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "retry this" } });
        fireEvent.click(screen.getByRole("button", { name: "Save memory" }));

        await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/was not saved/i));
        expect(input.value).toBe("retry this");

        fireEvent.click(screen.getByRole("button", { name: /delete memory/i }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/was not deleted/i));
        expect(onDelete).toHaveBeenCalledWith(memory.id);
    });
});
