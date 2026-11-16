"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Printer, UserPlus } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { GENDER, ROOM_TYPES, dateTime, kwacha } from "@/lib/format";
import type { BoardingHouse, Room, Tenancy } from "@/lib/types";
import { BedDots } from "@/components/boarding/BedDots";
import { Badge, Button, Dialog, Field, Notice, PageTitle, Panel, PanelHeader, Spinner, Stat, Tabs } from "@/components/kit";
import { RegisterOccupantDialog } from "@/components/provider/OccupantDialogs";
import { OccupantTable } from "@/components/provider/OccupantTable";

type Report = {
  generated_at: string;
  totals: { capacity: number; occupied: number; reserved: number; held: number; available: number; occupancy_rate: number };
  rooms: (Room & { occupants: { name: string; status: string; check_in_date: string | null; lease_end: string | null }[]; capacity: number; occupied: number; reserved: number; held: number; available: number })[];
  money: { rent_due: string; collected: string; outstanding: string };
  movements_last_30_days: { checked_in: number; checked_out: number };
};

export default function ManageBoardingHousePage() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get("created") === "1";
  const house = useApi<BoardingHouse>(`provider/boarding-houses/${id}`);
  const occupants = useApi<Tenancy[]>(`provider/boarding-houses/${id}/occupants`);
  const [tab, setTab] = useState<"rooms" | "occupants" | "report">("rooms");
  const [register, setRegister] = useState<{ open: boolean; roomId?: number }>({ open: false });
  const [editRoom, setEditRoom] = useState<Partial<Room> | null>(null);

  const reload = () => {
    house.reload();
    occupants.reload();
  };

  const h = house.data;
  if (house.loading && !h) return <Spinner />;
  if (house.error || !h) return <Notice tone="red">{house.error?.message ?? "Not found."}</Notice>;

  async function toggle(patch: Partial<BoardingHouse>) {
    await api(`provider/boarding-houses/${id}`, { method: "PATCH", body: patch }).catch(() => null);
    house.reload();
  }

  const current = (occupants.data ?? []).filter((t) => t.status === "active" || t.status === "reserved");
  const past = (occupants.data ?? []).filter((t) => t.status === "checked_out" || t.status === "cancelled");

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/provider/boarding" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-ink hover:text-ink">
        <ArrowLeft className="size-4" /> Boarding houses
      </Link>
      <PageTitle
        title={h.name}
        description={`${h.property.address} · ${GENDER[h.gender_policy]} · ${h.booking_mode === "instant" ? "Instant booking" : "Request to book"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/boarding-houses/${h.id}`} className="inline-flex h-11 items-center gap-1.5 px-2 text-sm font-semibold text-marker">
              Preview <ExternalLink className="size-3.5" />
            </Link>
            <Button variant="secondary" onClick={() => toggle({ is_active: !h.is_active })}>
              {h.is_active ? "Unpublish" : "Publish"}
            </Button>
            <Button onClick={() => setRegister({ open: true })}>
              <UserPlus className="size-4" /> Register occupant
            </Button>
          </div>
        }
      />
      {created && <Notice tone="green" className="mb-4">Registered. An administrator reviews new boarding houses before students can see them. You can register occupants already.</Notice>}
      {!h.is_approved && !created && <Notice tone="amber" className="mb-4">Waiting for administrator review. Students can&apos;t see this house yet.</Notice>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Beds" value={h.totals.capacity} />
        <Stat label="Checked in" value={h.totals.occupied} />
        <Stat label="Reserved" value={h.totals.reserved} sub={h.totals.held ? `+${h.totals.held} awaiting payment` : undefined} />
        <Stat label="Free beds" value={h.totals.available} />
        <Stat label="Occupancy" value={`${h.totals.occupancy_rate}%`} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "rooms", label: "Rooms", count: h.rooms.length },
          { value: "occupants", label: "Occupants", count: current.length },
          { value: "report", label: "Occupancy report" },
        ]}
      />

      <div className="mt-5">
        {tab === "rooms" && (
          <Panel>
            <PanelHeader title="Rooms" description="Beds taken are counted from checked-in and reserved occupants." action={<Button size="sm" variant="secondary" onClick={() => setEditRoom({ name: `Room ${String(h.rooms.length + 1).padStart(2, "0")}`, room_type: "double", capacity: 2, price_per_bed: h.rooms[0]?.price_per_bed ?? "", is_active: true })}><Plus className="size-4" /> Add room</Button>} />
            <ul className="divide-y divide-line">
              {h.rooms.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold">
                      {r.name} <span className="font-medium text-muted-ink">· {ROOM_TYPES[r.room_type]}</span> {!r.is_active && <Badge>Hidden</Badge>}
                    </p>
                    <p className="text-[13px] text-muted-ink">
                      Capacity {r.capacity} · Occupied {r.occupancy.occupied} · Reserved {r.occupancy.reserved}
                      {r.occupancy.held ? ` · ${r.occupancy.held} awaiting payment` : ""} · <b className="text-ink">{r.occupancy.available} free</b>
                    </p>
                  </div>
                  <BedDots room={r} />
                  <span className="w-28 text-right font-semibold tabular-nums">{kwacha(r.price_per_bed)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={r.occupancy.available < 1} onClick={() => setRegister({ open: true, roomId: r.id })}>
                      Add occupant
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditRoom(r)}>
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {tab === "occupants" && (
          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Current occupants" />
              {occupants.loading && !occupants.data ? <Spinner /> : <OccupantTable tenancies={current} onChange={reload} />}
            </Panel>
            {past.length > 0 && (
              <Panel>
                <PanelHeader title="Past occupants" />
                <OccupantTable tenancies={past} onChange={reload} />
              </Panel>
            )}
          </div>
        )}
        {tab === "report" && <OccupancyReport houseId={h.id} name={h.name} />}
      </div>

      <RegisterOccupantDialog open={register.open} onClose={() => setRegister({ open: false })} houseId={h.id} rooms={h.rooms.filter((r) => r.is_active)} defaultRoomId={register.roomId} onDone={reload} />
      <RoomDialog houseId={h.id} room={editRoom} onClose={() => setEditRoom(null)} onDone={reload} />
    </div>
  );
}

function RoomDialog({ houseId, room, onClose, onDone }: { houseId: number; room: Partial<Room> | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<Partial<Room>>({});
  const [state, setState] = useState({ busy: false, error: "" });
  const [lastRoom, setLastRoom] = useState<Partial<Room> | null>(null);
  if (room !== lastRoom) {
    setLastRoom(room);
    if (room) setForm(room);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    const body = { name: form.name, room_type: form.room_type, capacity: form.capacity, price_per_bed: form.price_per_bed, has_private_bathroom: form.has_private_bathroom ?? false, is_active: form.is_active ?? true };
    try {
      if (room?.id) await api(`provider/rooms/${room.id}`, { method: "PATCH", body });
      else await api(`provider/boarding-houses/${houseId}/rooms`, { method: "POST", body });
      setState({ busy: false, error: "" });
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={room !== null} onClose={onClose} title={room?.id ? `Edit ${room.name}` : "Add a room"}>
      <form onSubmit={submit} className="space-y-3">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Field label="Name">
          <input className="field" required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="field" value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })}>
            {Object.entries(ROOM_TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Beds" hint={room?.occupancy ? `${room.occupancy.capacity - room.occupancy.available} taken now` : undefined}>
            <input className="field" type="number" min={1} max={20} required value={form.capacity ?? 1} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </Field>
          <Field label="K per bed / month">
            <input className="field" inputMode="numeric" required value={form.price_per_bed ?? ""} onChange={(e) => setForm({ ...form, price_per_bed: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.has_private_bathroom ?? false} onChange={(e) => setForm({ ...form, has_private_bathroom: e.target.checked })} /> Own bathroom
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Show to students
        </label>
        <Button type="submit" busy={state.busy} className="w-full">
          Save room
        </Button>
      </form>
    </Dialog>
  );
}

function OccupancyReport({ houseId, name }: { houseId: number; name: string }) {
  const { data: r, loading, error } = useApi<Report>(`provider/boarding-houses/${houseId}/report`);
  if (loading && !r) return <Spinner />;
  if (error || !r) return <Notice tone="red">{error?.message}</Notice>;
  return (
    <Panel className="print:border-0">
      <PanelHeader
        title={`Occupancy report: ${name}`}
        description={`Generated ${dateTime(r.generated_at)}`}
        action={
          <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden">
            <Printer className="size-4" /> Print
          </Button>
        }
      />
      <div className="space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Occupancy", `${r.totals.occupancy_rate}%`],
            ["Rent due", kwacha(r.money.rent_due)],
            ["Collected", kwacha(r.money.collected)],
            ["Outstanding", kwacha(r.money.outstanding)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-subtle p-3">
              <dt className="text-xs text-muted-ink">{l}</dt>
              <dd className="text-lg font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-ink">
          Last 30 days: {r.movements_last_30_days.checked_in} checked in, {r.movements_last_30_days.checked_out} checked out.
        </p>
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted-ink">
            <tr>
              <th className="py-2 font-semibold">Room</th>
              <th className="py-2 text-right font-semibold">Capacity</th>
              <th className="py-2 text-right font-semibold">Occupied</th>
              <th className="py-2 text-right font-semibold">Reserved</th>
              <th className="py-2 text-right font-semibold">Free</th>
              <th className="py-2 pl-4 font-semibold">Occupants</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.rooms.map((room) => (
              <tr key={room.id} className="align-top">
                <td className="py-2.5 font-semibold">{room.name}</td>
                <td className="py-2.5 text-right tabular-nums">{room.capacity}</td>
                <td className="py-2.5 text-right tabular-nums">{room.occupied}</td>
                <td className="py-2.5 text-right tabular-nums">{room.reserved}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{room.available}</td>
                <td className="py-2.5 pl-4 text-ink-2">{room.occupants.map((o) => o.name).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line font-bold">
            <tr>
              <td className="py-2.5">Total</td>
              <td className="py-2.5 text-right">{r.totals.capacity}</td>
              <td className="py-2.5 text-right">{r.totals.occupied}</td>
              <td className="py-2.5 text-right">{r.totals.reserved}</td>
              <td className="py-2.5 text-right">{r.totals.available}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
