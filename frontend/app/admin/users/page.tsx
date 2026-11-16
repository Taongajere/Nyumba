"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { date } from "@/lib/format";
import { Badge, Button, Dialog, Field, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";

type Row = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  date_joined: string;
  last_login: string | null;
  provider_status: string;
  business_name: string;
  bookings: number;
};

const PROVIDER_TONE: Record<string, "green" | "amber" | "red" | "gray"> = { approved: "green", pending: "amber", rejected: "gray", suspended: "red" };

export default function UsersPage() {
  const [role, setRole] = useState<"" | "provider" | "admin">("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useApi<{ count: number; results: Row[] }>(`admin/users?page_size=100&role=${role}&q=${encodeURIComponent(query)}`);
  const [action, setAction] = useState<{ user: Row; kind: "suspend" | "reactivate" | "suspend-provider" | "reinstate-provider" } | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Users" description={data ? `${data.count} accounts` : undefined} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          value={role}
          onChange={setRole}
          items={[
            { value: "", label: "Everyone" },
            { value: "provider", label: "Providers" },
            { value: "admin", label: "Admins" },
          ]}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q);
          }}
          className="flex h-11 items-center gap-2 rounded-full border border-line px-4"
        >
          <Search className="size-4 text-muted-ink" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, username or email" aria-label="Search users" className="w-56 bg-transparent text-sm outline-none" />
        </form>
      </div>
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Notice tone="red">{error.message}</Notice>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-subtle text-left text-muted-ink">
              <tr>
                <th className="px-5 py-2.5 font-semibold">User</th>
                <th className="px-3 py-2.5 font-semibold">Provider</th>
                <th className="px-3 py-2.5 font-semibold">Joined</th>
                <th className="px-3 py-2.5 text-right font-semibold">Bookings</th>
                <th className="px-3 py-2.5 font-semibold">Account</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.results.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3">
                    <p className="font-semibold">
                      {u.full_name || u.username} {u.is_admin && <Badge tone="blue">Admin</Badge>}
                    </p>
                    <p className="text-xs text-muted-ink">
                      {u.username} · {u.email}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {u.provider_status === "none" ? (
                      <span className="text-muted-ink">—</span>
                    ) : (
                      <span className="flex flex-col items-start gap-0.5">
                        <Badge tone={PROVIDER_TONE[u.provider_status]}>{u.provider_status}</Badge>
                        {u.business_name && <span className="text-xs text-muted-ink">{u.business_name}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-ink-2">{date(u.date_joined)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.bookings}</td>
                  <td className="px-3 py-3">
                    <Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Suspended"}</Badge>
                  </td>
                  <td className="space-x-3 px-5 py-3 text-right whitespace-nowrap">
                    {u.provider_status === "approved" && (
                      <button type="button" className="font-semibold text-warn" onClick={() => setAction({ user: u, kind: "suspend-provider" })}>
                        Suspend provider
                      </button>
                    )}
                    {u.provider_status === "suspended" && (
                      <button type="button" className="font-semibold text-marker" onClick={() => setAction({ user: u, kind: "reinstate-provider" })}>
                        Reinstate provider
                      </button>
                    )}
                    {!u.is_admin &&
                      (u.is_active ? (
                        <button type="button" className="font-semibold text-bad" onClick={() => setAction({ user: u, kind: "suspend" })}>
                          Suspend account
                        </button>
                      ) : (
                        <button type="button" className="font-semibold text-marker" onClick={() => setAction({ user: u, kind: "reactivate" })}>
                          Reactivate
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActionDialog action={action} onClose={() => setAction(null)} onDone={reload} />
    </div>
  );
}

const COPY = {
  suspend: { title: "Suspend this account?", body: "They're signed out everywhere and can't log in until reactivated.", cta: "Suspend account", needsReason: false },
  reactivate: { title: "Reactivate this account?", body: "They can log in again.", cta: "Reactivate", needsReason: false },
  "suspend-provider": { title: "Suspend provider access?", body: "Their listings disappear from search and they lose provider tools. They can still use the marketplace.", cta: "Suspend provider", needsReason: true },
  "reinstate-provider": { title: "Reinstate provider access?", body: "Their approved listings return to search.", cta: "Reinstate", needsReason: false },
};

function ActionDialog({ action, onClose, onDone }: { action: { user: Row; kind: keyof typeof COPY } | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  const copy = action ? COPY[action.kind] : null;
  async function go() {
    if (!action) return;
    setState({ busy: true, error: "" });
    try {
      await api(`admin/users/${action.user.id}/${action.kind}`, { method: "POST", body: { reason } });
      setState({ busy: false, error: "" });
      setReason("");
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={Boolean(action)} onClose={onClose} title={copy?.title ?? ""}>
      {action && copy && (
        <div className="space-y-4">
          <p className="text-[15px] text-ink-2">
            <b>{action.user.full_name || action.user.username}</b>. {copy.body}
          </p>
          {state.error && <Notice tone="red">{state.error}</Notice>}
          {copy.needsReason && (
            <Field label="Reason (shown to them)">
              <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Back
            </Button>
            <Button variant={action.kind.startsWith("suspend") ? "danger" : "primary"} busy={state.busy} onClick={go}>
              {copy.cta}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
