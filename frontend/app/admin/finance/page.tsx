"use client";

import { useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { dateTime, kwacha } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { Badge, Button, Dialog, Field, Notice, PageTitle, Panel, PanelHeader, Spinner, Stat, Tabs } from "@/components/kit";

type Report = {
  totals: { gross: string; commission: string; fees: string; net: string; n: number };
  by_category: Record<string, { gross: string; commission: string; net: string; n: number }>;
  by_provider: { provider: string; gross: string; commission: string; net: string; bookings: number }[];
  refunds: string;
};
type Owed = { owed: { provider_id: number; provider: string; amount: string; bookings: number }[]; history: { id: number; provider_username: string; amount: string; reference: string; paid_at: string }[] };
type Refund = { id: number; tx_ref: string; booking_reference: string; amount: string; reason: string; status: string; created_at: string };

const CATEGORY: Record<string, string> = { stay: "Short stays", rent: "Rentals", boarding: "Boarding houses" };
const PAY_TONE: Record<string, "green" | "amber" | "red" | "gray" | "blue"> = { successful: "green", initiated: "amber", failed: "red", cancelled: "gray", refunded: "blue", partially_refunded: "blue" };

export default function FinancePage() {
  const [tab, setTab] = useState<"report" | "payments" | "payouts" | "refunds">("report");
  const [range, setRange] = useState({ from: "", to: "" });
  const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const report = useApi<Report>(tab === "report" ? `admin/financial-report?${q}` : null);
  const payments = useApi<{ results: Payment[] }>(tab === "payments" ? "admin/payments?page_size=100" : null);
  const payouts = useApi<Owed>(tab === "payouts" ? "admin/payouts" : null);
  const refunds = useApi<Refund[]>(tab === "refunds" ? "admin/refunds" : null);
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [paying, setPaying] = useState<Owed["owed"][number] | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Finance" description="Transactions, commission, provider payouts and refunds. All amounts are in Kwacha." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "report", label: "Report" },
          { value: "payments", label: "Transactions" },
          { value: "payouts", label: "Provider payouts" },
          { value: "refunds", label: "Refunds" },
        ]}
      />
      <div className="mt-5">
        {tab === "report" && (
          <>
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <label>
                <span className="mb-1 block text-xs font-semibold text-muted-ink">From</span>
                <input type="date" className="field h-10 w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-muted-ink">To</span>
                <input type="date" className="field h-10 w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
              </label>
              <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
                Print report
              </Button>
            </div>
            {!report.data ? (
              <Spinner />
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Stat label="Paid bookings" value={report.data.totals.n} />
                  <Stat label="Gross booking value" value={kwacha(report.data.totals.gross)} />
                  <Stat label="Platform commission" value={kwacha(report.data.totals.commission)} />
                  <Stat label="Provider earnings" value={kwacha(report.data.totals.net)} />
                  <Stat label="Refunded" value={kwacha(report.data.refunds)} />
                </div>
                <Panel>
                  <PanelHeader title="By category" />
                  <SimpleTable
                    head={["Category", "Bookings", "Gross", "Commission", "Providers"]}
                    rows={Object.entries(report.data.by_category).map(([k, v]) => [CATEGORY[k] ?? k, String(v.n), kwacha(v.gross), kwacha(v.commission), kwacha(v.net)])}
                  />
                </Panel>
                <Panel>
                  <PanelHeader title="By provider" />
                  <SimpleTable head={["Provider", "Bookings", "Gross", "Commission", "Earnings"]} rows={report.data.by_provider.map((p) => [p.provider, String(p.bookings), kwacha(p.gross), kwacha(p.commission), kwacha(p.net)])} />
                </Panel>
              </div>
            )}
          </>
        )}
        {tab === "payments" &&
          (!payments.data ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-subtle text-left text-muted-ink">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">When</th>
                    <th className="px-3 py-2.5 font-semibold">Booking</th>
                    <th className="px-3 py-2.5 font-semibold">Reference</th>
                    <th className="px-3 py-2.5 font-semibold">Gateway</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.data.results.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-ink-2">{dateTime(p.created_at)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/bookings/${p.booking}`} className="font-semibold hover:underline">
                          {p.booking_reference}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-ink">{p.gateway_transaction_id ?? p.tx_ref}</td>
                      <td className="px-3 py-3 text-ink-2">{p.gateway}</td>
                      <td className="px-3 py-3">
                        <Badge tone={PAY_TONE[p.status]}>{p.status.replace("_", " ")}</Badge>
                        {p.failure_reason && <span className="block text-xs text-muted-ink">{p.failure_reason}</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{kwacha(p.amount, { decimals: true })}</td>
                      <td className="px-5 py-3 text-right">
                        {["successful", "partially_refunded"].includes(p.status) && (
                          <button type="button" className="font-semibold text-marker" onClick={() => setRefunding(p)}>
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {tab === "payouts" &&
          (!payouts.data ? (
            <Spinner />
          ) : (
            <div className="space-y-6">
              <Panel>
                <PanelHeader title="Owed to providers" description="Earnings from verified payments not yet paid out." />
                {payouts.data.owed.length === 0 ? (
                  <p className="p-5 text-sm text-muted-ink">Nothing owed.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {payouts.data.owed.map((o) => (
                      <li key={o.provider_id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span>
                          <b>{o.provider}</b> <span className="text-sm text-muted-ink">· {o.bookings} bookings</span>
                        </span>
                        <span className="flex items-center gap-4">
                          <b className="tabular-nums">{kwacha(o.amount, { decimals: true })}</b>
                          <Button size="sm" onClick={() => setPaying(o)}>
                            Record payout
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel>
                <PanelHeader title="Payout history" />
                <SimpleTable head={["Provider", "Paid", "Reference", "Amount"]} rows={payouts.data.history.map((h) => [h.provider_username, dateTime(h.paid_at), h.reference, kwacha(h.amount, { decimals: true })])} />
              </Panel>
            </div>
          ))}
        {tab === "refunds" &&
          (!refunds.data ? (
            <Spinner />
          ) : (
            <Panel>
              <SimpleTable head={["When", "Booking", "Reason", "Status", "Amount"]} rows={refunds.data.map((r) => [dateTime(r.created_at), r.booking_reference, r.reason, r.status, kwacha(r.amount, { decimals: true })])} />
            </Panel>
          ))}
      </div>
      <RefundDialog payment={refunding} onClose={() => setRefunding(null)} onDone={payments.reload} />
      <PayoutDialog owed={paying} onClose={() => setPaying(null)} onDone={payouts.reload} />
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="p-5 text-sm text-muted-ink">Nothing for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-left text-muted-ink">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-5 py-2.5 font-semibold ${i >= head.length - 3 && i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-5 py-3 ${j >= r.length - 3 && j > 0 ? "text-right tabular-nums" : ""} ${j === 0 ? "font-semibold" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RefundDialog({ payment, onClose, onDone }: { payment: Payment | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  const remaining = payment ? Number(payment.amount) - Number(payment.refunded_amount) : 0;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!payment) return;
    setState({ busy: true, error: "" });
    try {
      await api("admin/refunds", { method: "POST", body: { payment_id: payment.id, amount, reason } });
      setState({ busy: false, error: "" });
      setAmount("");
      setReason("");
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={Boolean(payment)} onClose={onClose} title={`Refund ${payment?.booking_reference ?? ""}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2">Up to {kwacha(remaining, { decimals: true })} can still be refunded. A full refund also reverses Nyumba&apos;s commission.</p>
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Field label="Amount (K)">
          <input className="field" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={remaining.toFixed(2)} />
        </Field>
        <Field label="Reason (shown to the guest)">
          <input className="field" required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button type="submit" variant="danger" busy={state.busy} className="w-full">
          Issue refund
        </Button>
      </form>
    </Dialog>
  );
}

function PayoutDialog({ owed, onClose, onDone }: { owed: Owed["owed"][number] | null; onClose: () => void; onDone: () => void }) {
  const [reference, setReference] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!owed) return;
    setState({ busy: true, error: "" });
    try {
      await api("admin/payouts", { method: "POST", body: { provider_id: owed.provider_id, reference } });
      setState({ busy: false, error: "" });
      setReference("");
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={Boolean(owed)} onClose={onClose} title={`Record payout to ${owed?.provider ?? ""}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2">
          Send {owed ? kwacha(owed.amount, { decimals: true }) : ""} by bank or mobile money first, then record the reference here. This marks those bookings as paid out.
        </p>
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Field label="Transfer reference">
          <input className="field" required value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Button type="submit" busy={state.busy} className="w-full">
          Record payout
        </Button>
      </form>
    </Dialog>
  );
}
