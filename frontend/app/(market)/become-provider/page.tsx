"use client";

import { useState } from "react";
import { BadgeCheck, Clock, PauseCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PROVIDER_TYPES, date } from "@/lib/format";
import type { ProviderApplication } from "@/lib/types";
import { Button, Field, Notice, PageTitle, Panel, Spinner } from "@/components/kit";

const STEPS = [
  { title: "Apply", body: "Tell us who you are and what you rent out." },
  { title: "Review", body: "A Nyumba administrator checks your details, usually within two working days." },
  { title: "List", body: "Once approved, switch to provider tools to add properties and boarding houses." },
];

export default function BecomeProviderPage() {
  const { me, refresh, switchMode } = useSession();
  if (!me) return <Spinner />;
  const status = me.provider_status;
  const app = me.latest_application;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageTitle
        title="Become a provider"
        description="List homes, short stays or boarding houses with the account you already have. You keep your favourites and bookings."
      />

      {status === "approved" && (
        <Panel className="flex flex-wrap items-center gap-4 p-6">
          <BadgeCheck className="size-8 text-ok" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">You&apos;re an approved provider</p>
            <p className="text-sm text-muted-ink">{me.provider?.business_name}</p>
          </div>
          <Button onClick={() => switchMode("provider")}>Open provider tools</Button>
        </Panel>
      )}
      {status === "pending" && app && (
        <Panel className="flex items-start gap-4 p-6">
          <Clock className="size-8 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-semibold">Your application is being reviewed</p>
            <p className="mt-1 text-sm text-muted-ink">
              Sent {date(app.created_at)} for {app.business_name}. You can keep using the marketplace meanwhile. We&apos;ll notify you when it&apos;s decided.
            </p>
          </div>
        </Panel>
      )}
      {status === "suspended" && (
        <Panel className="flex items-start gap-4 p-6">
          <PauseCircle className="size-8 shrink-0 text-bad" aria-hidden />
          <div>
            <p className="font-semibold">Your provider account is suspended</p>
            <p className="mt-1 text-sm text-muted-ink">
              {me.provider?.suspension_reason || "Contact Nyumba support to be reinstated."} Your listings are hidden until then. You can still use the marketplace.
            </p>
          </div>
        </Panel>
      )}
      {(status === "none" || status === "rejected") && (
        <>
          {status === "rejected" && app && (
            <Notice tone={app.can_reapply ? "amber" : "red"} className="mb-6">
              <p className="font-semibold">Your last application wasn&apos;t approved</p>
              <p className="mt-1">Reason: {app.rejection_reason}</p>
              {!app.can_reapply && <p className="mt-1">This account can&apos;t reapply. Contact Nyumba support if you think this is wrong.</p>}
            </Notice>
          )}
          <ol className="mb-8 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line p-4">
                <span className="grid size-7 place-items-center rounded-full bg-navy text-[13px] font-bold text-white">{i + 1}</span>
                <p className="mt-3 font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-ink">{s.body}</p>
              </li>
            ))}
          </ol>
          {(status === "none" || app?.can_reapply) && <ApplicationForm previous={app} onDone={refresh} />}
        </>
      )}
    </div>
  );
}

function ApplicationForm({ previous, onDone }: { previous: ProviderApplication | null; onDone: () => void }) {
  const { me } = useSession();
  const [form, setForm] = useState({
    provider_type: previous?.provider_type ?? "landlord",
    business_name: previous?.business_name ?? `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim(),
    phone_number: previous?.phone_number ?? me?.profile.phone_number ?? "",
    town: previous?.town ?? me?.profile.town ?? "Lusaka",
    business_registration_number: previous?.business_registration_number ?? "",
    property_count_estimate: previous?.property_count_estimate ?? 1,
    description: previous?.description ?? "",
  });
  const [state, setState] = useState({ busy: false, error: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === "property_count_estimate" ? Number(e.target.value) : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      await api("provider-applications", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <Panel className="p-6">
      <h2 className="mb-4 text-lg font-bold">{previous ? "Apply again" : "Your application"}</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {state.error && <Notice tone="red" className="sm:col-span-2">{state.error}</Notice>}
        <Field label="What do you do?" className="sm:col-span-2">
          <select className="field" value={form.provider_type} onChange={set("provider_type")}>
            {Object.entries(PROVIDER_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Business or trading name" hint="Shown to guests on your listings.">
          <input className="field" required value={form.business_name} onChange={set("business_name")} />
        </Field>
        <Field label="Phone we can call">
          <input className="field" type="tel" required value={form.phone_number} onChange={set("phone_number")} />
        </Field>
        <Field label="Town">
          <input className="field" required value={form.town} onChange={set("town")} />
        </Field>
        <Field label="How many places do you manage?">
          <input className="field" type="number" min={1} value={form.property_count_estimate} onChange={set("property_count_estimate")} />
        </Field>
        <Field label="PACRA registration number (optional)" className="sm:col-span-2">
          <input className="field" value={form.business_registration_number} onChange={set("business_registration_number")} />
        </Field>
        <Field label="Tell us about your properties" className="sm:col-span-2">
          <textarea className="field" rows={4} value={form.description} onChange={set("description")} placeholder="For example: 2 flats in Kabulonga and a 12-bed boarding house near UNZA." />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" busy={state.busy}>
            Submit application
          </Button>
        </div>
      </form>
    </Panel>
  );
}
