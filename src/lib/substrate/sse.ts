import type { SubstrateEvent } from "./types";

export interface SSEClientOptions {
  baseUrl: string;
  onEvent: (e: SubstrateEvent) => void;
  onState: (s: "connecting" | "open" | "error") => void;
}

export function startSSE(opts: SSEClientOptions): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let backoff = 1000;

  const open = () => {
    if (stopped) return;
    opts.onState("connecting");
    try {
      es = new EventSource(`${opts.baseUrl}/api/stream`);
    } catch (err) {
      opts.onState("error");
      schedule();
      return;
    }
    es.onopen = () => {
      backoff = 1000;
      opts.onState("open");
    };
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as SubstrateEvent;
        opts.onEvent(parsed);
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      opts.onState("error");
      es?.close();
      es = null;
      schedule();
    };
  };

  const schedule = () => {
    if (stopped) return;
    setTimeout(open, backoff);
    backoff = Math.min(backoff * 1.6, 8000);
  };

  open();

  return () => {
    stopped = true;
    es?.close();
    es = null;
  };
}

export async function fetchSeed(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/seed`);
  if (!res.ok) throw new Error(`seed ${res.status}`);
  return res.json();
}

export async function postReset(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`reset ${res.status}`);
}

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";