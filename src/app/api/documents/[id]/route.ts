import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getActiveBusiness } from "../../../../lib/business";
import { readLocalFile } from "../../../../lib/uploads";

// Serve a locally-stored document back to the browser (inline). Drive-backed
// documents use their webViewLink instead, so this only handles storage=local.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const business = await getActiveBusiness();
  if (!business) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const doc = await prisma.document.findFirst({ where: { id, businessId: business.id } });
  if (!doc || doc.storage !== "local" || !doc.localKey) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const bytes = new Uint8Array(await readLocalFile(doc.localKey));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
