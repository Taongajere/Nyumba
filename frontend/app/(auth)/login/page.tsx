"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Notice } from "@/components/kit";

function LoginForm() {
  const params = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Can't reach Nyumba. Check your connection." };
    if (!res?.ok) {
      setError(data.error ?? "Couldn't log in. Try again.");
      setBusy(false);
      return;
    }
    const next = params.get("next");
    const home = data.user?.is_admin ? "/admin" : data.user?.active_mode === "provider" ? "/provider" : "/";
    // Full navigation so every part of the app starts from the new session.
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : home;
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Log in</h1>
      <p className="mt-1.5 text-[15px] text-muted-ink">Welcome back. Pick up where you left off.</p>
      {params.get("reset") === "1" && (
        <Notice tone="green" className="mt-6">
          Password changed. Log in with your new password.
        </Notice>
      )}
      {error && (
        <Notice tone="red" className="mt-6">
          {error}
        </Notice>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Email or username">
          <input
            className="field"
            autoComplete="username"
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-marker hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" busy={busy} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted-ink">
        New to Nyumba?{" "}
        <Link href="/register" className="font-semibold text-ink hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
