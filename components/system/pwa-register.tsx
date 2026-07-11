"use client";

import { useEffect } from "react";

// register sw in prod only — don't want cached responses in dev
export function PWARegister() {
    useEffect(() => {
        if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
            navigator.serviceWorker.register("/sw.js").catch(console.warn);
        }
    }, []);
    return null;
}
