"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isRegistering
      ? "http://127.0.0.1:8000/api/register/"
      : "http://127.0.0.1:8000/api/login/";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      // Put the VIP wristband ("token") and username into the browser's pocket
      localStorage.setItem("nyumba_token", data.token);
      localStorage.setItem("nyumba_user", data.username);

      // Send the user straight to the Post Property screen!
      router.push("/post-property");
    } catch (err) {
      setError("Could not reach the Django server. Is it running?");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf8f5] px-6 py-12 text-[#133a2a]">
      <div className="mx-auto max-w-md rounded-2xl border border-[#133a2a]/15 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[#133a2a]">
          {isRegistering ? "Create a Nyumba Account" : "Welcome Back"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {isRegistering
            ? "Sign up to list properties or save favourites."
            : "Log in to manage or post your Lusaka listings."}
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. taonga_lusaka"
              className="mt-1 w-full rounded-xl border border-[#133a2a]/20 px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-xl border border-[#133a2a]/20 px-4 py-2.5 text-sm focus:border-[#133a2a] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#133a2a] py-3 text-sm font-bold text-white transition hover:bg-[#1a4d38] disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : isRegistering
                ? "Create Account"
                : "Log In"}
          </button>
        </form>

        <div className="mt-6 border-t border-stone-100 pt-4 text-center text-sm text-stone-600">
          {isRegistering ? "Already have an account?" : "New to Nyumba?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError("");
            }}
            className="font-bold text-[#9a741c] hover:underline"
          >
            {isRegistering ? "Log in instead" : "Register here"}
          </button>
        </div>
      </div>
    </main>
  );
}