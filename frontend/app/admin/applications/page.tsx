"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { PROVIDER_TYPES, date } from "@/lib/format";
import type { ProviderApplication } from "@/lib/types";
import { Badge, Button, Dialog, Empty, Field, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";

type AdminApplication = ProviderApplication & { username: string; email: string; full_name: string; reviewed_by: string | null };

export default function ApplicationsPage() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const { data, error, loading, reload } = useApi<AdminApplication[]>(`admin/applications?status=${status}`);
  const [rejecting, setRejecting] = useState<AdminApplication | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  async function approve(a: AdminApplication) {
    setBusy(a.id);
    setMessage(null);
    try {
      await api(`admin/applications/${a.id}/approve`, { method: "POST" });
      setMessage({ tone: "green", text: `${a.business_name} approved. ${a.full_name || a.username} has been notified.` });
      reload();
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Provider applications" description="Approve people who will list places on Nyumba. Rejected applicants see your reason." />
      <Tabs
        value={status}
        onChange={setStatus}
        items={[
          { value: "pending", label: "Waiting" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
          { value: "all", label: "All" },
        ]}
      />
      {message && <Notice tone={message.tone} className="mt-4">{message.text}</Notice>}
      <div className="mt-5">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <Notice tone="red">{error.message}</Notice>
        ) : !data?.length ? (
          <Empty icon={ClipboardCheck} title={status === "pending" ? "No applications waiting" : "Nothing here"} />
        ) : (
          <ul className="space-y-3">
            {data.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{a.business_name}</p>
                    <p className="text-sm text-muted-ink">
                      {a.full_name || a.username} · {a.email} · applied {date(a.created_at)}
                    </p>
                  </div>
                  <Badge tone={a.status === "approved" ? "green" : a.status === "rejected" ? "red" : "amber"}>{a.status === "pending" ? "Waiting" : a.status === "approved" ? "Approved" : "Rejected"}</Badge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <Info label="Type" value={PROVIDER_TYPES[a.provider_type]} />
                  <Info label="Phone" value={a.phone_number} />
                  <Info label="Town" value={a.town} />
                  <Info label="Places" value={String(a.property_count_estimate)} />
                  {a.business_registration_number && <Info label="PACRA no." value={a.business_registration_number} />}
                </dl>
                {a.description && <p className="mt-3 text-[15px] text-ink-2">{a.description}</p>}
                {a.rejection_reason && <Notice tone="gray" className="mt-3">Reason given: {a.rejection_reason}{!a.can_reapply && " (can't reapply)"}</Notice>}
                {a.status === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <Button busy={busy === a.id} onClick={() => approve(a)}>
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => setRejecting(a)}>
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <RejectDialog application={rejecting} onClose={() => setRejecting(null)} onDone={reload} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-ink">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function RejectDialog({ application, onClose, onDone }: { application: AdminApplication | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [canReapply, setCanReapply] = useState(true);
  const [state, setState] = useState({ busy: false, error: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!application) return;
    setState({ busy: true, error: "" });
    try {
      await api(`admin/applications/${application.id}/reject`, { method: "POST", body: { reason, can_reapply: canReapply } });
      setState({ busy: false, error: "" });
      setReason("");
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={Boolean(application)} onClose={onClose} title={`Reject ${application?.business_name ?? ""}?`}>
      <form onSubmit={submit} className="space-y-4">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Field label="Reason" hint="The applicant sees this. Say what they need to fix.">
          <textarea className="field" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={canReapply} onChange={(e) => setCanReapply(e.target.checked)} /> Allow them to apply again
        </label>
        <Button type="submit" variant="danger" busy={state.busy} className="w-full">
          Reject application
        </Button>
      </form>
    </Dialog>
  );
}
