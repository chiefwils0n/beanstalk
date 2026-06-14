import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getActiveBusiness } from "../../../lib/business";
import { isGoogleConfigured, uploadToDrive } from "../../../lib/google";
import { saveLocalFile } from "../../../lib/uploads";

export async function POST(request: NextRequest) {
  const business = await getActiveBusiness();
  if (!business) {
    return NextResponse.json({ error: "Create a business first" }, { status: 400 });
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });
  }
  const category = String(formData.get("category") || "OTHER");
  const entryId = String(formData.get("entryId") || "") || null;
  const invoiceId = String(formData.get("invoiceId") || "") || null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isGoogleConfigured()) {
      const uploaded = await uploadToDrive(business, {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer,
      });
      const document = await prisma.document.create({
        data: {
          businessId: business.id,
          name: file.name,
          mimeType: file.type || null,
          category,
          storage: "drive",
          driveFileId: uploaded.id,
          webViewLink: uploaded.webViewLink,
          entryId,
          invoiceId,
        },
      });
      return NextResponse.json({ id: document.id });
    }

    // No Google configured → store on local disk and serve it back via
    // /api/documents/[id].
    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        name: file.name,
        mimeType: file.type || null,
        category,
        storage: "local",
        entryId,
        invoiceId,
      },
    });
    const key = await saveLocalFile(business.id, document.id, file.name, buffer);
    await prisma.document.update({ where: { id: document.id }, data: { localKey: key } });
    return NextResponse.json({ id: document.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
