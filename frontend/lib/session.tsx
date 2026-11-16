"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Me, Mode } from "@/lib/types";

type Session = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  setMe: (me: Me) => void;
  switchMode: (mode: Mode) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api<Me>("me");
      setMe(next);
      return next;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Sign-in pages have no session to load.
    if (!window.location.pathname.match(/^\/(login|register|forgot-password|reset-password)/)) {
      Promise.resolve().then(refresh);
    }
  }, [refresh]);

  const switchMode = useCallback(
    async (mode: Mode) => {
      const next = await api<Me>("me/mode", { method: "POST", body: { mode } });
      setMe(next);
      document.cookie = `nyumba_mode=${next.active_mode}; path=/; samesite=lax`;
      router.push(mode === "provider" ? "/provider" : "/");
    },
    [router]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setMe(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(() => ({ me, loading, refresh, setMe, switchMode, logout }), [me, loading, refresh, switchMode, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export function displayName(me: Me | null) {
  if (!me) return "";
  return me.first_name || me.username;
}
