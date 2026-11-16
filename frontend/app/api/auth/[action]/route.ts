import { NextResponse, type NextRequest } from "next/server";
import { DJANGO_URL, MODE_COOKIE, TOKEN_COOKIE, tokenCookieOptions } from "@/lib/server-config";

// Sign-in endpoints. The Django token is kept in an httpOnly cookie so page scripts never see it.
const FORWARD: Record<string, string> = {
  login: "/api/auth/login/",
  register: "/api/auth/register/",
  "change-password": "/api/auth/change-password/",
};

export async function POST(request: NextRequest, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;

  if (action === "logout") {
    const token = request.cookies.get(TOKEN_COOKIE)?.value;
    if (token) {
      await fetch(`${DJANGO_URL}/api/auth/logout/`, {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
      }).catch(() => null);
    }
    const res = NextResponse.json({ message: "Logged out." });
    res.cookies.delete(TOKEN_COOKIE);
    res.cookies.delete(MODE_COOKIE);
    return res;
  }

  const path = FORWARD[action];
  if (!path) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const existing = request.cookies.get(TOKEN_COOKIE)?.value;
  if (action === "change-password" && existing) headers.Authorization = `Token ${existing}`;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;

  let upstream: Response;
  try {
    upstream = await fetch(`${DJANGO_URL}${path}`, { method: "POST", headers, body: await request.text() });
  } catch {
    return NextResponse.json({ error: "Nyumba's server isn't reachable. Try again in a moment." }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({ error: "Unexpected response from the server." }));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = NextResponse.json({ user: data.user });
  res.cookies.set(TOKEN_COOKIE, data.token, tokenCookieOptions);
  res.cookies.set(MODE_COOKIE, data.user.active_mode, { ...tokenCookieOptions, httpOnly: false });
  return res;
}
