"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { GENDER, ROOM_TYPES } from "@/lib/format";
import type { BoardingHouse } from "@/lib/types";
import { Button, Field, Notice, PageTitle, Panel } from "@/components/kit";
import { EMPTY_PROPERTY, PropertyFields } from "@/components/provider/PropertyFields";

type RoomDraft = { name: string; room_type: string; capacity: number; price_per_bed: string; has_private_bathroom: boolean };

export default function NewBoardingHousePage() {
  const router = useRouter();
  const [property, setProperty] = useState({ ...EMPTY_PROPERTY, property_type: "boarding_house", amenities: ["Wi-Fi", "Security"] });
  const [house, setHouse] = useState({ name: "", near_institution: "", gender_policy: "mixed", booking_mode: "request", rules: "", description: "" });
  const [rooms, setRooms] = useState<RoomDraft[]>([{ name: "Room 01", room_type: "dorm", capacity: 4, price_per_bed: "", has_private_bathroom: false }]);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [state, setState] = useState({ busy: false, error: "" });

  const setRoom = (i: number, patch: Partial<RoomDraft>) => setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      const created = await api<BoardingHouse>("provider/boarding-houses", {
        method: "POST",
        body: { ...house, name: house.name || property.title, amenities: property.amenities, property: { ...property, title: property.title || house.name }, rooms },
      });
      router.push(`/provider/boarding/${created.id}?created=1`);
    } catch (err) {
      setErrors(((err as ApiError).fields as Record<string, string[]>) ?? {});
      setState({ busy: false, error: (err as Error).message });
    }
  }

  const beds = rooms.reduce((n, r) => n + (r.capacity || 0), 0);
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Register a boarding house" description="Set up the house, then its rooms. Each room has a fixed number of beds that can never be overfilled." />
      <form onSubmit={submit} className="space-y-6">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Panel className="p-5">
          <h2 className="mb-4 font-bold">The house</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Boarding house name" className="sm:col-span-2">
              <input
                className="field"
                required
                value={house.name}
                onChange={(e) => {
                  setHouse({ ...house, name: e.target.value });
                  setProperty({ ...property, title: e.target.value });
                }}
              />
            </Field>
            <Field label="Near which school or university?">
              <input className="field" value={house.near_institution} onChange={(e) => setHouse({ ...house, near_institution: e.target.value })} placeholder="University of Zambia (UNZA)" />
            </Field>
            <Field label="Who can stay">
              <select className="field" value={house.gender_policy} onChange={(e) => setHouse({ ...house, gender_policy: e.target.value })}>
                {Object.entries(GENDER).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="How students book" hint={house.booking_mode === "instant" ? "Students book and pay online straight away." : "You accept each request; students then pay online."}>
              <select className="field" value={house.booking_mode} onChange={(e) => setHouse({ ...house, booking_mode: e.target.value })}>
                <option value="request">Request to book</option>
                <option value="instant">Instant booking</option>
              </select>
            </Field>
            <Field label="House rules" className="sm:col-span-2">
              <textarea className="field" rows={2} value={house.rules} onChange={(e) => setHouse({ ...house, rules: e.target.value })} />
            </Field>
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-4 font-bold">Location and amenities</h2>
          <PropertyFields value={{ ...property, title: property.title || house.name }} onChange={(v) => setProperty({ ...v, property_type: "boarding_house" })} errors={errors} hideType />
        </Panel>
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Rooms</h2>
            <p className="text-sm text-muted-ink">{beds} beds in total</p>
          </div>
          <ul className="space-y-3">
            {rooms.map((r, i) => (
              <li key={i} className="grid items-end gap-3 rounded-2xl bg-subtle p-3 sm:grid-cols-[1fr_1fr_90px_120px_auto]">
                <Field label="Room name">
                  <input className="field" required value={r.name} onChange={(e) => setRoom(i, { name: e.target.value })} />
                </Field>
                <Field label="Type">
                  <select className="field" value={r.room_type} onChange={(e) => setRoom(i, { room_type: e.target.value })}>
                    {Object.entries(ROOM_TYPES).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Beds">
                  <input className="field" type="number" min={1} max={20} required value={r.capacity} onChange={(e) => setRoom(i, { capacity: Number(e.target.value) })} />
                </Field>
                <Field label="K per bed/month">
                  <input className="field" inputMode="numeric" required value={r.price_per_bed} onChange={(e) => setRoom(i, { price_per_bed: e.target.value })} />
                </Field>
                <Button variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))} disabled={rooms.length === 1}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setRooms((rs) => [...rs, { name: `Room ${String(rs.length + 1).padStart(2, "0")}`, room_type: "double", capacity: 2, price_per_bed: rs[rs.length - 1]?.price_per_bed ?? "", has_private_bathroom: false }])}
          >
            <Plus className="size-4" /> Add room
          </Button>
        </Panel>
        <Button type="submit" size="lg" busy={state.busy}>
          Register and submit for review
        </Button>
      </form>
    </div>
  );
}
