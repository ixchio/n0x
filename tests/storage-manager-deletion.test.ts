import { describe, expect, it, vi } from "vitest";
import { deleteDatabaseDurably } from "@/components/system/storage-manager";

describe("Storage Manager IndexedDB deletion", () => {
    it("keeps a blocked delete pending and resolves when the same request later succeeds", async () => {
        const request: Partial<IDBOpenDBRequest> = {};
        const factory = { deleteDatabase: vi.fn(() => request as IDBOpenDBRequest) };
        const onBlocked = vi.fn();
        let settled = false;

        const deletion = deleteDatabaseDurably(factory, "n0x_chat", onBlocked).finally(() => {
            settled = true;
        });
        const typedRequest = request as IDBOpenDBRequest;
        typedRequest.onblocked?.call(typedRequest, {} as IDBVersionChangeEvent);
        await Promise.resolve();

        expect(onBlocked).toHaveBeenCalledOnce();
        expect(settled).toBe(false);
        typedRequest.onsuccess?.call(typedRequest, {} as Event);
        await expect(deletion).resolves.toBeUndefined();
    });
});
