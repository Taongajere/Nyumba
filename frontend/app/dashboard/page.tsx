"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"listings" | "inquiries" | "bookings" | "earnings">("listings");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function loadDashboard(savedToken: string) {
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/dashboard/", {
        headers: {
          Authorization: `Token ${savedToken}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const savedToken = localStorage.getItem("nyumba_token");
    const savedUser = localStorage.getItem("nyumba_user");
    setToken(savedToken);
    setUsername(savedUser);

    if (savedToken) {
      loadDashboard(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  async function handleBookingAction(bookingId: number, status: "confirmed" | "cancelled") {
    if (!token) return;
    const res = await fetch(`http://127.0.0.1:8000/api/bookings/${bookingId}/status/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      loadDashboard(token); // Refresh dashboard numbers immediately
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-[#faf8f5] px-6 py-16 text-center text-[#133a2a]">
        <div className="mx-auto max-w-md rounded-2xl border border-[#133a2a]/15 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold">Owner & Agent Dashboard</h1>
          <p className="mt-2 text-sm text-stone-500">
            Please log in to view your properties, enquiries, and earnings.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-[#133a2a] px-6 py-3 text-sm font-bold text-white"
          >
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf8f5] px-6 py-10 text-[#133a2a]">
      <div className="mx-auto max-w-5xl">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#133a2a]/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold">Owner Dashboard</h1>
            <p className="mt-1 text-sm text-stone-500">
              Welcome back, <strong>{username}</strong>
            </p>
          </div>
          <Link
            href="/post-property"
            className="rounded-xl bg-[#d4a843] px-5 py-2.5 text-sm font-bold text-[#133a2a] shadow-sm hover:bg-[#e0b653]"
          >
            + Add New Property
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 mb-8 flex flex-wrap gap-2">
          {[
            { id: "listings", label: `My Properties (${data?.listings?.length ?? 0})` },
            { id: "inquiries", label: `Enquiries (${data?.inquiries?.length ?? 0})` },
            { id: "bookings", label: `Bookings (${data?.bookings?.length ?? 0})` },
            { id: "earnings", label: "Earnings" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#133a2a] text-white"
                  : "border border-[#133a2a]/20 bg-white text-[#133a2a] hover:bg-[#133a2a]/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-stone-500">Loading your dashboard...</p>
        ) : (
          <>
            {/* TAB 1: My Properties */}
            {activeTab === "listings" && (
              <div className="space-y-4">
                {data?.listings?.length === 0 ? (
                  <p className="rounded-xl bg-white p-6 text-stone-500">
                    You haven&apos;t posted any properties yet.
                  </p>
                ) : (
                  data?.listings?.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#133a2a]/15 bg-white p-5 shadow-sm"
                    >
                      <div>
                        <span className="text-xs font-bold uppercase text-[#9a741c]">
                          {item.kind} · {item.property?.neighbourhood || "Lusaka"}
                        </span>
                        <h2 className="mt-1 text-lg font-bold">
                          {item.property?.title}
                        </h2>
                        <p className="text-sm text-stone-500">
                          K{Number(item.price).toLocaleString()} · {item.property?.bedrooms} Bed
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3.5 py-1 text-xs font-bold uppercase ${
                          item.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: Enquiries */}
            {activeTab === "inquiries" && (
              <div className="space-y-4">
                {data?.inquiries?.length === 0 ? (
                  <p className="rounded-xl bg-white p-6 text-stone-500">
                    No customer enquiries yet.
                  </p>
                ) : (
                  data?.inquiries?.map((inq: any) => (
                    <div
                      key={inq.id}
                      className="rounded-xl border border-[#133a2a]/15 bg-white p-5 shadow-sm"
                    >
                      <div className="flex justify-between text-xs text-stone-400">
                        <span className="font-bold text-[#9a741c]">
                          {inq.property_title}
                        </span>
                        <span>{inq.created_at}</span>
                      </div>
                      <p className="mt-2 font-bold">
                        {inq.name} · <span className="text-[#133a2a]">{inq.phone}</span>
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {inq.message || "No message provided."}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: Short-Stay Bookings */}
            {activeTab === "bookings" && (
              <div className="space-y-4">
                {data?.bookings?.length === 0 ? (
                  <p className="rounded-xl bg-white p-6 text-stone-500">
                    No short-stay bookings yet.
                  </p>
                ) : (
                  data?.bookings?.map((bk: any) => (
                    <div
                      key={bk.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#133a2a]/15 bg-white p-5 shadow-sm"
                    >
                      <div>
                        <p className="text-xs font-bold uppercase text-[#9a741c]">
                          {bk.property_title}
                        </p>
                        <h3 className="mt-1 font-bold">
                          {bk.guest_name} ({bk.guest_phone})
                        </h3>
                        <p className="text-sm text-stone-600">
                          {bk.check_in} → {bk.check_out} ·{" "}
                          <strong>K{Number(bk.total_amount).toLocaleString()}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {bk.status === "requested" ? (
                          <>
                            <button
                              onClick={() => handleBookingAction(bk.id, "confirmed")}
                              className="rounded-lg bg-[#133a2a] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1a4d38]"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleBookingAction(bk.id, "cancelled")}
                              className="rounded-lg border border-red-200 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold uppercase text-stone-700">
                            {bk.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: Earnings & Commission Summary */}
            {activeTab === "earnings" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#133a2a]/15 bg-white p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase text-stone-400">
                    Gross Bookings
                  </p>
                  <p className="mt-2 text-2xl font-extrabold">
                    K{Number(data?.earnings?.gross ?? 0).toLocaleString()}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#133a2a]/15 bg-white p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase text-stone-400">
                    Nyumba Commission (10%)
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-[#9a741c]">
                    - K{Number(data?.earnings?.commission ?? 0).toLocaleString()}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#133a2a] p-6 text-white shadow-sm">
                  <p className="text-xs font-bold uppercase text-white/70">
                    Net Owner Earnings
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-[#f3cf7a]">
                    K{Number(data?.earnings?.net ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}