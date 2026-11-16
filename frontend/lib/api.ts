"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser-side calls to Django go through /api/backend, which adds the session token.
export class ApiError extends Error {
  status: number;
  fields?: Record<string, unknown>;
  constructor(message: string, status: number, fields?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T = unknown>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  const clean = path.replace(/^\/+/, "");
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api/backend/${clean}`, {
      method,
      signal,
      headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Can't reach Nyumba. Check your connection and try again.", 0);
  }
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong. Try again.", res.status, data.fields);
  return data as T;
}

// Small data hook: loads on mount and whenever the path changes; `reload` refetches.
// The last result stays visible while a new request runs; `loading` says whether it is current.
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const key = path ? `${path}#${tick}` : null;
  const [entry, setEntry] = useState<{ key: string | null; data: T | null; error: ApiError | null }>({ key: null, data: null, error: null });
  const latest = useRef<string | null>(null);

  useEffect(() => {
    if (!path || !key) return;
    const controller = new AbortController();
    latest.current = key;
    api<T>(path, { signal: controller.signal })
      .then((data) => latest.current === key && setEntry({ key, data, error: null }))
      .catch((err) => {
        if ((err as Error).name === "AbortError" || latest.current !== key) return;
        setEntry((prev) => ({ key, data: prev.data, error: err as ApiError }));
      });
    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data: T) => setEntry((prev) => ({ ...prev, data })), []);
  return { data: entry.data, error: entry.key === key ? entry.error : null, loading: Boolean(key) && entry.key !== key, reload, setData };
}
