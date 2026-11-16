"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { Button, Notice, PageTitle, Panel, PanelHeader, Spinner } from "@/components/kit";

type Rate = { id: number; category: string; label: string; rate: string; processing_fee_rate: string; updated_at: string };
type Categories = Record<string, [string, string][]>;

const VOCAB_LABEL: Record<string, string> = {
  listing_kinds: "Listing kinds",
  property_types: "Property types",
  furnishing: "Furnishing",
  room_types: "Room types",
  gender_policies: "Boarding-house residents",
  provider_types: "Provider types",
};

export default function AdminSettingsPage() {
  const rates = useApi<Rate[]>("admin/commission-rates");
  const categories = useApi<Categories>("admin/categories");
  const [draft, setDraft] = useState<Record<string, { rate: string; fee: string }>>({});
  const [state, setState] = useState({ busy: false, error: "", saved: false });

  const [seen, setSeen] = useState<Rate[] | null>(null);
  if (rates.data && rates.data !== seen) {
    setSeen(rates.data);
    setDraft(
        Object.fromEntries(
          rates.data.map((r) => [r.category, { rate: (Number(r.rate) * 100).toFixed(2).replace(/\.00$/, ""), fee: (Number(r.processing_fee_rate) * 100).toFixed(2).replace(/\.00$/, "") }])
        )
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "", saved: false });
    try {
      await api("admin/commission-rates", {
        method: "PATCH",
        body: Object.entries(draft).map(([category, v]) => ({
          category,
          rate: (Number(v.rate) / 100).toFixed(4),
          processing_fee_rate: (Number(v.fee) / 100).toFixed(4),
        })),
      });
      setState({ busy: false, error: "", saved: true });
      rates.reload();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message, saved: false });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Commission & categories" />
      <Panel>
        <PanelHeader title="Commission rates" description="Applied to new bookings when they're created. Existing bookings keep the rate they were booked at." />
        {!rates.data ? (
          <Spinner />
        ) : (
          <form onSubmit={save} className="p-5">
            {state.error && <Notice tone="red" className="mb-4">{state.error}</Notice>}
            {state.saved && <Notice tone="green" className="mb-4">Rates saved.</Notice>}
            <table className="w-full text-sm">
              <thead className="text-left text-muted-ink">
                <tr>
                  <th className="pb-2 font-semibold">Booking type</th>
                  <th className="pb-2 font-semibold">Nyumba commission</th>
                  <th className="pb-2 font-semibold">Payment fee passed to provider</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rates.data.map((r) => (
                  <tr key={r.category}>
                    <td className="py-3 font-semibold">{r.label}</td>
                    {(["rate", "fee"] as const).map((k) => (
                      <td key={k} className="py-3">
                        <span className="inline-flex items-center rounded-xl border border-line-strong pr-3 focus-within:border-marker">
                          <input
                            className="h-10 w-20 bg-transparent px-3 text-right outline-none"
                            inputMode="decimal"
                            aria-label={`${r.label} ${k === "rate" ? "commission" : "payment fee"} percent`}
                            value={draft[r.category]?.[k] ?? ""}
                            onChange={(e) => setDraft({ ...draft, [r.category]: { ...draft[r.category], [k]: e.target.value } })}
                          />
                          %
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[13px] text-muted-ink">Sales are enquiry-only on Nyumba, so they have no booking commission.</p>
            <Button type="submit" busy={state.busy} className="mt-4">
              Save rates
            </Button>
          </form>
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Categories" description="The fixed vocabularies used in search filters and forms on web and mobile." />
        {!categories.data ? (
          <Spinner />
        ) : (
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            {Object.entries(categories.data).map(([k, items]) => (
              <div key={k}>
                <h3 className="mb-2 text-sm font-semibold">{VOCAB_LABEL[k] ?? k}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {items.map(([value, label]) => (
                    <li key={value} className="rounded-full bg-subtle px-2.5 py-1 text-xs font-semibold text-ink-2">
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
