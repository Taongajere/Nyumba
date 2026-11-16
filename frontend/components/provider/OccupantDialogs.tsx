"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { kwacha, todayISO } from "@/lib/format";
import type { Room, Tenancy } from "@/lib/types";
import { Button, Dialog, Field, Notice } from "@/components/kit";

export function RegisterOccupantDialog({
  open,
  onClose,
  houseId,
  rooms,
  defaultRoomId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  houseId: number;
  rooms: Room[];
  defaultRoomId?: number;
  onDone: () => void;
}) {
  const free = rooms.filter((r) => r.occupancy.available > 0);
  const blank = () => ({
    room_id: defaultRoomId ?? free[0]?.id ?? 0,
    username: "",
    occupant_name: "",
    occupant_phone: "",
    institution: "",
    student_number: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    term: "",
    status: "active",
    check_in_date: todayISO(),
    lease_end: "",
    amount_paid: "0",
  });
  const [form, setForm] = useState(blank);
  const [state, setState] = useState({ busy: false, error: "" });
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const openKey = open ? `room-${defaultRoomId ?? "any"}` : null;
  if (openKey !== openedFor) {
    // Each time the dialog opens, start from a blank form for the chosen room.
    setOpenedFor(openKey);
    if (openKey) setForm(blank());
  }

  const set = (k: keyof ReturnType<typeof blank>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: k === "room_id" ? Number(e.target.value) : e.target.value }));
  const room = rooms.find((r) => r.id === form.room_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      await api(`provider/boarding-houses/${houseId}/occupants`, {
        method: "POST",
        body: { ...form, lease_end: form.lease_end || null, check_in_date: form.check_in_date || null },
      });
      setState({ busy: false, error: "" });
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Register an occupant" wide>
      {free.length === 0 ? (
        <Notice tone="amber">Every bed is taken. Check someone out or add capacity first.</Notice>
      ) : (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {state.error && <Notice tone="red" className="sm:col-span-2">{state.error}</Notice>}
          <Field label="Room">
            <select className="field" value={form.room_id} onChange={set("room_id")}>
              {free.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}: {r.occupancy.available} of {r.capacity} free · {kwacha(r.price_per_bed)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="field" value={form.status} onChange={set("status")}>
              <option value="active">Checked in now</option>
              <option value="reserved">Reserved, moving in later</option>
            </select>
          </Field>
          <Field label="Full name">
            <input className="field" required value={form.occupant_name} onChange={set("occupant_name")} />
          </Field>
          <Field label="Phone">
            <input className="field" type="tel" value={form.occupant_phone} onChange={set("occupant_phone")} />
          </Field>
          <Field label="Nyumba username (optional)" hint="Links the bed to their account so they see it too.">
            <input className="field" value={form.username} onChange={set("username")} />
          </Field>
          <Field label="School or university">
            <input className="field" value={form.institution} onChange={set("institution")} />
          </Field>
          <Field label="Student number">
            <input className="field" value={form.student_number} onChange={set("student_number")} />
          </Field>
          <Field label="Term">
            <input className="field" value={form.term} onChange={set("term")} placeholder="2027 Semester 1" />
          </Field>
          <Field label="Check-in date">
            <input className="field" type="date" value={form.check_in_date} onChange={set("check_in_date")} />
          </Field>
          <Field label="Lease ends">
            <input className="field" type="date" value={form.lease_end} onChange={set("lease_end")} />
          </Field>
          <Field label="Emergency contact name">
            <input className="field" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
          </Field>
          <Field label="Emergency contact phone">
            <input className="field" type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
          </Field>
          <Field label={`Amount already paid (rent ${room ? kwacha(room.price_per_bed) : ""})`}>
            <input className="field" inputMode="numeric" value={form.amount_paid} onChange={set("amount_paid")} />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" busy={state.busy}>
              Register occupant
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function EditOccupantDialog({ tenancy, onClose, onDone }: { tenancy: Tenancy | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<Partial<Tenancy>>({});
  const [state, setState] = useState({ busy: false, error: "" });
  const [shown, setShown] = useState<Tenancy | null>(null);
  if (tenancy !== shown) {
    setShown(tenancy);
    if (tenancy) setForm(tenancy);
  }
  const set = (k: keyof Tenancy) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenancy) return;
    setState({ busy: true, error: "" });
    try {
      const { occupant_name, occupant_phone, institution, student_number, emergency_contact_name, emergency_contact_phone, term, lease_end, rent_amount, amount_paid, notes } = form;
      await api(`provider/occupants/${tenancy.id}`, {
        method: "PATCH",
        body: { occupant_name, occupant_phone, institution, student_number, emergency_contact_name, emergency_contact_phone, term, lease_end: lease_end || null, rent_amount, amount_paid, notes },
      });
      setState({ busy: false, error: "" });
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <Dialog open={Boolean(tenancy)} onClose={onClose} title={tenancy ? `${tenancy.occupant_name} · ${tenancy.room_name}` : ""} wide>
      {tenancy && (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {state.error && <Notice tone="red" className="sm:col-span-2">{state.error}</Notice>}
          <Field label="Full name">
            <input className="field" required value={form.occupant_name ?? ""} onChange={set("occupant_name")} />
          </Field>
          <Field label="Phone">
            <input className="field" value={form.occupant_phone ?? ""} onChange={set("occupant_phone")} />
          </Field>
          <Field label="School or university">
            <input className="field" value={form.institution ?? ""} onChange={set("institution")} />
          </Field>
          <Field label="Student number">
            <input className="field" value={form.student_number ?? ""} onChange={set("student_number")} />
          </Field>
          <Field label="Emergency contact">
            <input className="field" value={form.emergency_contact_name ?? ""} onChange={set("emergency_contact_name")} />
          </Field>
          <Field label="Emergency phone">
            <input className="field" value={form.emergency_contact_phone ?? ""} onChange={set("emergency_contact_phone")} />
          </Field>
          <Field label="Rent for the term (K)">
            <input className="field" inputMode="numeric" value={form.rent_amount ?? ""} onChange={set("rent_amount")} />
          </Field>
          <Field label="Paid so far (K)" hint="Record cash or offline payments here. Online payments are added automatically.">
            <input className="field" inputMode="numeric" value={form.amount_paid ?? ""} onChange={set("amount_paid")} />
          </Field>
          <Field label="Lease ends">
            <input className="field" type="date" value={form.lease_end ?? ""} onChange={set("lease_end")} />
          </Field>
          <Field label="Term">
            <input className="field" value={form.term ?? ""} onChange={set("term")} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className="field" rows={2} value={form.notes ?? ""} onChange={set("notes")} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" busy={state.busy}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
