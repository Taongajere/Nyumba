"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Notice } from "@/components/kit";

function ResetForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/backend/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, token, password }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Can't reach Nyumba." };
    if (!res?.ok) {
      setError(data.error ?? "Couldn't change the password.");
      setBusy(false);
      return;
    }
    window.location.href = "/login?reset=1";
  }

  if (!uid || !token) {
    return (
      <Notice tone="red" className="mt-6">
        This link is incomplete. <Link href="/forgot-password" className="font-semibold underline">Ask for a new one</Link>.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      <Field label="New password" hint="At least 8 characters. Avoid common words.">
        <input className="field" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repeat new password">
        <input className="field" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" busy={busy} className="w-full">
        Change password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <h1 className="text-[28px] font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-[15px] text-muted-ink">You&apos;ll be signed out on other devices.</p>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
