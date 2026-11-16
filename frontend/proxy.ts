import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: no session cookie, no app. Django still checks every API call.
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get("nyumba_token")?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the auth/API routes and static files.
  matcher: ["/((?!api/|_next/|favicon.ico|maplibre/|.*\.(?:png|jpg|jpeg|svg|webp|ico|mjs)$).*)"],
};
