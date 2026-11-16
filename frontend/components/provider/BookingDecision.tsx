"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Booking } from "@/lib/types";
import { Button, Dialog, Field, Notice } from "@/components/kit";

// Accept / decline buttons for a booking request, with an optional note to the guest.
export function BookingDecision({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const [mode, setMode] = useState<null | "accept" | "reject" | "cancel">(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });

  async function submit() {
    if (!mode) return;
    setState({ busy: true, error: "" });
    try {
      await api(`provider/bookings/${booking.id}/${mode}`, { method: "POST", body: { note } });
      setMode(null);
      setNote("");
      setState({ busy: false, error: "" });
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }

  const title = { accept: "Accept this request?", reject: "Decline this request?", cancel: "Cancel this booking?" };
  const explain = {
    accept: "The guest gets 24 hours to pay online. The dates or bed are held for them meanwhile.",
    reject: "The guest is told it was declined. Nothing has been paid.",
    cancel: "The guest is refunded in full and notified.",
  };

  return (
    <>
      <div className="flex gap-2">
        {booking.status === "pending" ? (
          <>
            <Button size="sm" onClick={() => setMode("accept")}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("reject")}>
              Decline
            </Button>
          </>
        ) : ["awaiting_payment", "confirmed"].includes(booking.status) ? (
          <Button size="sm" variant="ghost" className="text-bad" onClick={() => setMode("cancel")}>
            Cancel
          </Button>
        ) : null}
      </div>
      <Dialog open={mode !== null} onClose={() => setMode(null)} title={mode ? title[mode] : ""}>
        {mode && (
          <div className="space-y-4">
            <p className="text-[15px] text-ink-2">{explain[mode]}</p>
            {state.error && <Notice tone="red">{state.error}</Notice>}
            <Field label={mode === "accept" ? "Note to the guest (optional)" : "Reason (shown to the guest)"}>
              <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode(null)}>
                Back
              </Button>
              <Button variant={mode === "accept" ? "primary" : "danger"} busy={state.busy} onClick={submit}>
                {mode === "accept" ? "Accept request" : mode === "reject" ? "Decline request" : "Cancel booking"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
