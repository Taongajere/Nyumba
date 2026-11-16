// Server-only settings for talking to Django. Never imported by client components.
export const DJANGO_URL = (process.env.DJANGO_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const TOKEN_COOKIE = "nyumba_token";
export const MODE_COOKIE = "nyumba_mode";

export const tokenCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 14, // two weeks
};
