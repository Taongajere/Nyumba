"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PostPropertyPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [bedrooms, setBedrooms] = useState(2);
  const [kind, setKind] = useState("rent");
  const [price, setPrice] = useState("");

  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Check if the user has a wristband in their browser's pocket
  useEffect(() => {
    const savedToken = localStorage.getItem("nyumba_token");
    const savedUser = localStorage.getItem("nyumba_user");
    setToken(savedToken);
    setUsername(savedUser);
  }, []);

  function handleLogout() {
    localStorage.removeItem("nyumba_token");
    localStorage.removeItem("nyumba_user");
    setToken(null);
    setUsername(null);
    router.push("/login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatusMsg("");
    setSubmitting(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/listings/create/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Flash the VIP wristband to Django!
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          title,
          address,
          bedrooms,
          kind,
          price,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not submit property.");
        setSubmitting(false);
        return;
      }

      setStatusMsg(data.message);
      setTitle("");
      setAddress("");
      setPrice("");
      setSubmitting(false);
    } catch (err) {
      setError("Could not reach Django. Check that your backend is running.");
      setSubmitting(false);
    }
  }

  // If no wristband is found, ask them to log in first
  if (!token) {
    return (
      <main className="min-h-screen bg-[#faf8f5] px-6 py-16 text-center text-[#133a2a]">
        <div className="mx-auto max-w-md rounded-2xl border border-[#133a2a]/15 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold">Sign in to list a property</h1>
          <p className="mt-2 text-sm text-stone-500">
            You need a Nyumba account before posting a house or apartment.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-[#133a2a] px-6 py-3 text-sm font-bold text-white"
          >
            Go to Login / Register
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf8f5] px-6 py-10 text-[#133a2a]">
      <div className="mx-auto max-w-xl rounded-2xl border border-[#133a2a]/15 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div>
            <h1 className="text-2xl font-bold">Post a Property</h1>
            <p className="text-xs text-stone-500">
              Signed in as <strong>{username}</strong>
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-stone-500 hover:text-red-600"
          >
            Log out
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {statusMsg && (
          <div className="mt-4 rounded-lg bg-[#133a2a]/10 p-4 text-sm text-[#133a2a]">
            <strong>✓ {statusMsg}</strong>
            <p className="mt-1 text-xs text-stone-600">
              Tip: Open Django Admin (<code>/admin</code>) and change its status
              from <em>pending</em> to <em>approved</em> to see it live in the
              marketplace!
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold">Property Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Modern 3-Bedroom House in Kabulonga"
              className="mt-1 w-full rounded-xl border border-[#133a2a]/20 px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold">
              Lusaka Neighbourhood / Address
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Leopard's Hill Road, Kabulonga"
              className="mt-1 w-full rounded-xl border border-[#133a2a]/20 px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold">Listing Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#133a2a]/20 bg-white px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
              >
                <option value="rent">Rent</option>
                <option value="sale">Sale</option>
                <option value="stay">Short stay</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold">Bedrooms</label>
              <input
                type="number"
                min={1}
                required
                value={bedrooms}
                onChange={(e) => setBedrooms(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#133a2a]/20 px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold">Price (ZMW)</label>
            <input
              type="number"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 8500"
              className="mt-1 w-full rounded-xl border border-[#133a2a]/20 px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#d4a843] py-3 text-sm font-bold text-[#133a2a] shadow-sm transition hover:bg-[#e0b653] disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Property for Review"}
          </button>
        </form>
      </div>
    </main>
  );
}