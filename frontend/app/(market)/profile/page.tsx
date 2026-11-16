"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Me } from "@/lib/types";
import { Button, Field, Notice, PageTitle, Panel, Spinner } from "@/components/kit";

export default function ProfilePage() {
  const { me, setMe } = useSession();
  const [form, setForm] = useState<Record<string, string>>({});
  const [state, setState] = useState({ busy: false, error: "", saved: false });
  const [loadedFor, setLoadedFor] = useState<typeof me>(null);

  if (me && me !== loadedFor) {
    // Fill the form from the latest profile (first load, and after saving).
    setLoadedFor(me);
    setForm({
      first_name: me.first_name,
      last_name: me.last_name,
      phone_number: me.profile.phone_number,
      town: me.profile.town,
      institution: me.profile.institution,
      student_id: me.profile.student_id,
      emergency_contact_name: me.profile.emergency_contact_name,
      emergency_contact_phone: me.profile.emergency_contact_phone,
    });
  }

  if (!me) return <Spinner />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "", saved: false });
    try {
      setMe(await api<Me>("me", { method: "PATCH", body: form }));
      setState({ busy: false, error: "", saved: true });
    } catch (err) {
      setState({ busy: false, error: (err as Error).message, saved: false });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageTitle title="Profile" description={`Signed in as ${me.username} (${me.email}).`} />
      <form onSubmit={submit} className="space-y-6">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        {state.saved && <Notice tone="green">Profile saved.</Notice>}
        <Panel className="p-5">
          <h2 className="mb-4 font-bold">About you</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input className="field" value={form.first_name ?? ""} onChange={set("first_name")} />
            </Field>
            <Field label="Last name">
              <input className="field" value={form.last_name ?? ""} onChange={set("last_name")} />
            </Field>
            <Field label="Phone">
              <input className="field" type="tel" value={form.phone_number ?? ""} onChange={set("phone_number")} />
            </Field>
            <Field label="Town">
              <input className="field" value={form.town ?? ""} onChange={set("town")} />
            </Field>
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="font-bold">Student details</h2>
          <p className="mt-1 mb-4 text-sm text-muted-ink">Optional. Boarding-house providers see these when you book a bed.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School or university">
              <input className="field" value={form.institution ?? ""} onChange={set("institution")} />
            </Field>
            <Field label="Student number">
              <input className="field" value={form.student_id ?? ""} onChange={set("student_id")} />
            </Field>
            <Field label="Emergency contact name">
              <input className="field" value={form.emergency_contact_name ?? ""} onChange={set("emergency_contact_name")} />
            </Field>
            <Field label="Emergency contact phone">
              <input className="field" type="tel" value={form.emergency_contact_phone ?? ""} onChange={set("emergency_contact_phone")} />
            </Field>
          </div>
        </Panel>
        <Button type="submit" busy={state.busy}>
          Save profile
        </Button>
      </form>
    </div>
  );
}
