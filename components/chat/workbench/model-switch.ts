import { useWebLLM } from "@/lib/providers/useWebLLM";

/** Wait until a stopped WebLLM stream releases the engine before replacing it. */
export function waitForWebLLMGenerationToSettle(timeoutMs = 4_000): Promise<boolean> {
    if (useWebLLM.getState().status !== "generating") return Promise.resolve(true);

    return new Promise(resolve => {
        let settled = false;
        let unsubscribe = () => {};
        const finish = (ready: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            unsubscribe();
            resolve(ready);
        };
        const timeout = setTimeout(() => finish(useWebLLM.getState().status !== "generating"), timeoutMs);
        unsubscribe = useWebLLM.subscribe(state => {
            if (state.status !== "generating") finish(true);
        });

        // Cover a status change between the initial read and subscription.
        if (useWebLLM.getState().status !== "generating") finish(true);
    });
}
