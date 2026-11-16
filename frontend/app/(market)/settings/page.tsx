"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { Button, Field, Notice, PageTitle, Panel } from "@/components/kit";

export default function SettingsPage() {
  const { me, switchMode, logout } = useSession();
  const [form, setForm] = useState({ current_password: "", new_password: "", repeat: "" });
  const [state, setState] = useState({ busy: false, error: "", done: false });

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (form.new_password !== form.repeat) {
      setState({ busy: false, error: "The new passwords don't match.", done: false });
      return;
    }
    setState({ busy: true, error: "", done: false });
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Can't reach Nyumba." };
    if (!res?.ok) {
      setState({ busy: false, error: data.error ?? "Couldn't change the password.", done: false });
      return;
    }
    setForm({ current_password: "", new_password: "", repeat: "" });
    setState({ busy: false, error: "", done: true });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageTitle title="Settings" />
      <div className="space-y-6">
        <Panel className="p-5">
          <h2 className="font-bold">Password</h2>
          <p className="mt-1 mb-4 text-sm text-muted-ink">Changing it signs you out on your other devices.</p>
          <form onSubmit={changePassword} className="grid max-w-md gap-4">
            {state.error && <Notice tone="red">{state.error}</Notice>}
            {state.done && <Notice tone="green">Password changed.</Notice>}
            <Field label="Current password">
              <input className="field" type="password" autoComplete="current-password" required value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
            </Field>
            <Field label="New password" hint="At least 8 characters. Avoid common words.">
              <input className="field" type="password" autoComplete="new-password" required value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
            </Field>
            <Field label="Repeat new password">
              <input className="field" type="password" autoComplete="new-password" required value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
            </Field>
            <div>
              <Button type="submit" busy={state.busy}>
                Change password
              </Button>
            </div>
          </form>
        </Panel>
        {me?.can_use_provider_tools && (
          <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-bold">Provider tools</h2>
              <p className="mt-1 text-sm text-muted-ink">Same account, same favourites. Switch whenever you like.</p>
            </div>
            <Button variant="secondary" onClick={() => switchMode("provider")}>
              Switch to provider tools
            </Button>
          </Panel>
        )}
        <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-bold">Log out</h2>
            <p className="mt-1 text-sm text-muted-ink">Sign out of Nyumba on this device.</p>
          </div>
          <Button variant="secondary" onClick={logout}>
            Log out
          </Button>
        </Panel>
      </div>
    </div>
  );
}
