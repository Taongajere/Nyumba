"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Notice } from "@/components/kit";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/backend/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError(data.error ?? "Couldn't send the link. Try again.");
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell>
      <h1 className="text-[28px] font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-[15px] text-muted-ink">Enter the email on your account and we&apos;ll send you a link to choose a new password.</p>
      {sent ? (
        <Notice tone="green" className="mt-6">
          If {email} has a Nyumba account, a reset link is on its way. It works for two hours.
        </Notice>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Notice tone="red">{error}</Notice>}
          <Field label="Email">
            <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" busy={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-8 text-sm text-muted-ink">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
