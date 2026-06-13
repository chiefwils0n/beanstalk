import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifySession } from "./lib/auth";

// Gate every request behind the single-password session when AUTH_PASSWORD is
// set. /login (and its server action) is excluded via the matcher below.
export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
