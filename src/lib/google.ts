import "server-only";
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { prisma } from "./db";
import type { Business } from "@prisma/client";

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getOAuthClient() {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/google/callback`
  );
}

export async function getSavedAuth() {
  if (!isGoogleConfigured()) return null;
  return prisma.googleAuth.findUnique({ where: { id: "default" } });
}

export async function getDrive(): Promise<drive_v3.Drive | null> {
  const saved = await getSavedAuth();
  if (!saved) return null;
  const client = getOAuthClient();
  client.setCredentials({
    access_token: saved.accessToken,
    refresh_token: saved.refreshToken ?? undefined,
    expiry_date: saved.expiryDate ? Number(saved.expiryDate) : undefined,
  });
  client.on("tokens", (tokens) => {
    prisma.googleAuth
      .update({
        where: { id: "default" },
        data: {
          accessToken: tokens.access_token ?? saved.accessToken,
          refreshToken: tokens.refresh_token ?? saved.refreshToken,
          expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : saved.expiryDate,
        },
      })
      .catch(() => {});
  });
  return google.drive({ version: "v3", auth: client });
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const query = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const existing = await drive.files.list({ q: query, fields: "files(id)", pageSize: 1 });
  const found = existing.data.files?.[0]?.id;
  if (found) return found;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return created.data.id!;
}

/** Folder layout in Drive: Beanstalk / <business name> / files. */
export async function ensureBusinessFolder(
  drive: drive_v3.Drive,
  business: Business
): Promise<string> {
  if (business.driveFolderId) {
    try {
      await drive.files.get({ fileId: business.driveFolderId, fields: "id, trashed" });
      return business.driveFolderId;
    } catch {
      // folder was deleted in Drive; recreate below
    }
  }
  const rootId = await findOrCreateFolder(drive, "Beanstalk");
  const folderId = await findOrCreateFolder(drive, business.name, rootId);
  await prisma.business.update({ where: { id: business.id }, data: { driveFolderId: folderId } });
  return folderId;
}

export async function uploadToDrive(
  business: Business,
  file: { name: string; mimeType: string; buffer: Buffer }
): Promise<{ id: string; webViewLink: string | null }> {
  const drive = await getDrive();
  if (!drive) throw new Error("Google Drive is not connected");
  const folderId = await ensureBusinessFolder(drive, business);
  const created = await drive.files.create({
    requestBody: { name: file.name, parents: [folderId] },
    media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
    fields: "id, webViewLink",
  });
  return { id: created.data.id!, webViewLink: created.data.webViewLink ?? null };
}

export async function trashDriveFile(fileId: string) {
  const drive = await getDrive();
  if (!drive) return;
  await drive.files.update({ fileId, requestBody: { trashed: true } }).catch(() => {});
}
