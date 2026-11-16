"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Notice } from "@/components/kit";

type Errors = Record<string, string[] | undefined>;

export default function RegisterPage() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    username: "",
    phone_number: "",
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Can't reach Nyumba. Check your connection." };
    if (!res?.ok) {
      setErrors(data.fields ?? {});
      setError(data.fields ? "Check the highlighted fields." : data.error);
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  const err = (key: string) => errors[key]?.[0];

  return (
    <AuthShell>
      <h1 className="text-[28px] font-bold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-[15px] text-muted-ink">One account to search, save and book. Renting out a place? You can apply for that later.</p>
      {error && (
        <Notice tone="red" className="mt-6">
          {error}
        </Notice>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={err("first_name")}>
            <input className="field" autoComplete="given-name" required value={form.first_name} onChange={set("first_name")} />
          </Field>
          <Field label="Last name" error={err("last_name")}>
            <input className="field" autoComplete="family-name" value={form.last_name} onChange={set("last_name")} />
          </Field>
        </div>
        <Field label="Email" error={err("email")}>
          <input className="field" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Username" error={err("username")} hint="Letters and numbers. You can log in with this or your email.">
          <input className="field" autoComplete="username" required value={form.username} onChange={set("username")} />
        </Field>
        <Field label="Phone (optional)" error={err("phone_number")}>
          <input className="field" type="tel" autoComplete="tel" placeholder="0977 123 456" value={form.phone_number} onChange={set("phone_number")} />
        </Field>
        <Field label="Password" error={err("password")} hint="At least 8 characters. Avoid common words.">
          <input className="field" type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} />
        </Field>
        <Button type="submit" size="lg" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted-ink">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
