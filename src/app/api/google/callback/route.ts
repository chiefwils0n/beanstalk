import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "../../../../lib/db";
import { getOAuthClient } from "../../../../lib/google";

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${appUrl}/documents`);
  }
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email: string | null = null;
  try {
    const info = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    email = info.data.email ?? null;
  } catch {
    // email is cosmetic; ignore failures
  }

  await prisma.googleAuth.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      scope: tokens.scope ?? null,
      email,
    },
    update: {
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? undefined,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      scope: tokens.scope ?? null,
      email,
    },
  });

  return NextResponse.redirect(`${appUrl}/documents`);
}
