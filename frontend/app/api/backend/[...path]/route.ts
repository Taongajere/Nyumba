import { NextResponse, type NextRequest } from "next/server";
import { DJANGO_URL, TOKEN_COOKIE } from "@/lib/server-config";

// Same-origin pass-through to the Django API that adds the signed-in user's token.
// Browser code calls /api/backend/<path>; Django sees /api/<path>.
async function forward(request: NextRequest, ctx: RouteContext<"/api/backend/[...path]">) {
  const { path } = await ctx.params;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const target = `${DJANGO_URL}/api/${path.map(encodeURIComponent).join("/")}/${request.nextUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("authorization", `Token ${token}`);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Nyumba's server isn't reachable. Try again in a moment." }, { status: 502 });
  }

  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  const res = new NextResponse(body, { status: upstream.status });
  const type = upstream.headers.get("content-type");
  if (type) res.headers.set("content-type", type);
  if (upstream.status === 401) res.cookies.delete(TOKEN_COOKIE); // token revoked or account suspended
  return res;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
