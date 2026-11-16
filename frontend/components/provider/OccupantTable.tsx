"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { date, kwacha } from "@/lib/format";
import type { Tenancy } from "@/lib/types";
import { Badge, Button, Notice } from "@/components/kit";
import { EditOccupantDialog } from "@/components/provider/OccupantDialogs";

const STATUS: Record<Tenancy["status"], { label: string; tone: "green" | "blue" | "gray" }> = {
  active: { label: "Checked in", tone: "green" },
  reserved: { label: "Reserved", tone: "blue" },
  checked_out: { label: "Checked out", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

export function OccupantTable({ tenancies, onChange, showHouse }: { tenancies: Tenancy[]; onChange: () => void; showHouse?: boolean }) {
  const [editing, setEditing] = useState<Tenancy | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function move(t: Tenancy, action: "check-in" | "check-out") {
    setBusy(t.id);
    setError("");
    try {
      await api(`provider/occupants/${t.id}/${action}`, { method: "POST" });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!tenancies.length) return <p className="p-5 text-sm text-muted-ink">No occupants here yet.</p>;
  return (
    <>
      {error && <Notice tone="red" className="m-5">{error}</Notice>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-subtle text-left text-muted-ink">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Occupant</th>
              <th className="px-3 py-2.5 font-semibold">{showHouse ? "House / room" : "Room"}</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Dates</th>
              <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tenancies.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-3">
                  <p className="font-semibold">{t.occupant_name}</p>
                  <p className="text-xs text-muted-ink">{[t.occupant_phone, t.institution, t.booking_reference && `Booking ${t.booking_reference}`].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-3 text-ink-2">{showHouse ? `${t.boarding_house_name} / ${t.room_name}` : t.room_name}</td>
                <td className="px-3 py-3">
                  <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                </td>
                <td className="px-3 py-3 text-ink-2">
                  {t.check_in_date ? date(t.check_in_date) : "—"}
                  {t.lease_end && ` → ${date(t.lease_end)}`}
                  {t.check_out_date && <span className="block text-xs text-muted-ink">Left {date(t.check_out_date)}</span>}
                </td>
                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${Number(t.balance) > 0 ? "text-warn" : "text-ok"}`}>
                  {Number(t.balance) > 0 ? kwacha(t.balance) : "Paid"}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {t.status === "reserved" && (
                    <Button size="sm" variant="secondary" busy={busy === t.id} onClick={() => move(t, "check-in")}>
                      Check in
                    </Button>
                  )}
                  {t.status === "active" && (
                    <Button size="sm" variant="secondary" busy={busy === t.id} onClick={() => move(t, "check-out")}>
                      Check out
                    </Button>
                  )}
                  <button type="button" onClick={() => setEditing(t)} className="ml-3 text-sm font-semibold text-marker">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EditOccupantDialog tenancy={editing} onClose={() => setEditing(null)} onDone={onChange} />
    </>
  );
}
