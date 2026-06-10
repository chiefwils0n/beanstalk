import { NextResponse } from "next/server";
import { getOAuthClient, isGoogleConfigured, DRIVE_SCOPES } from "../../../../lib/google";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env" },
      { status: 400 }
    );
  }
  const url = getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...DRIVE_SCOPES, "https://www.googleapis.com/auth/userinfo.email"],
  });
  return NextResponse.redirect(url);
}
