"use client";

import { useState } from "react";

export default function PropertyActionBox({ listing }: { listing: any }) {
  const isShortStay = listing.kind === "stay";

  // Shared fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Rental/Sale enquiry message
  const [message, setMessage] = useState("");

  // Short-stay booking dates
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Quick preview of nights & estimated total for short stays (server always recalculates the real total!)
  let previewNights = 0;
  if (isShortStay && checkIn && checkOut) {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) previewNights = diff;
  }
  const previewTotal = previewNights * Number(listing.price);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setSubmitting(true);

    const url = isShortStay
      ? `http://127.0.0.1:8000/api/listings/${listing.id}/book/`
      : `http://127.0.0.1:8000/api/listings/${listing.id}/inquire/`;

    const payload = isShortStay
      ? {
          guest_name: name,
          guest_phone: phone,
          check_in: checkIn,
          check_out: checkOut,
        }
      : {
          name,
          phone,
          message,
        };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }

      setSuccessMsg(data.message);
      setName("");
      setPhone("");
      setMessage("");
      setCheckIn("");
      setCheckOut("");
      setSubmitting(false);
    } catch (err) {
      setError("Could not reach Django. Check that your backend is running.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl bg-[#133a2a] p-6 text-white sm:p-8">
      <h2 className="text-xl font-bold">
        {isShortStay ? "Book This Short Stay" : "Request a Viewing or Enquiry"}
      </h2>
      <p className="mt-1 text-sm text-white/80">
        {isShortStay
          ? `K${Number(listing.price).toLocaleString()} per night · Instant date availability check`
          : "Leave your details below and the property owner will get in touch."}
      </p>

      {error && (
        <div className="mt-4 rounded-xl bg-red-500/20 border border-red-300/40 p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-4 rounded-xl bg-[#d4a843]/25 border border-[#d4a843] p-4 text-sm text-[#f8df9b]">
          <strong>✓ {successMsg}</strong>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-white/80">
              Your Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chanda Mwale"
              className="mt-1 w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#133a2a] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-white/80">
              Phone / WhatsApp Number
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0977123456"
              className="mt-1 w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#133a2a] focus:outline-none"
            />
          </div>
        </div>

        {isShortStay ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-white/80">
                  Check-In Date
                </label>
                <input
                  type="date"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#133a2a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-white/80">
                  Check-Out Date
                </label>
                <input
                  type="date"
                  required
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#133a2a] focus:outline-none"
                />
              </div>
            </div>

            {previewNights > 0 && (
              <div className="rounded-xl bg-white/10 p-3.5 text-sm">
                <div className="flex justify-between">
                  <span>
                    {previewNights} night{previewNights > 1 ? "s" : ""} × K
                    {Number(listing.price).toLocaleString()}
                  </span>
                  <strong className="text-[#f3cf7a]">
                    Est. Total: K{previewTotal.toLocaleString()}
                  </strong>
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-white/80">
              Message / Preferred Viewing Day
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi, I would love to schedule a viewing this weekend..."
              className="mt-1 w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#133a2a] focus:outline-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[#d4a843] py-3 text-sm font-bold text-[#133a2a] shadow-sm transition hover:bg-[#e0b653] disabled:opacity-50"
        >
          {submitting
            ? "Sending..."
            : isShortStay
              ? "Request Short-Stay Booking"
              : "Send Viewing Enquiry"}
        </button>
      </form>
    </div>
  );
}