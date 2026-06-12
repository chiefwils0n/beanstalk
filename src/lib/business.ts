import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

export const BUSINESS_COOKIE = "beanstalk_business";

export async function getActiveBusiness() {
  const id = (await cookies()).get(BUSINESS_COOKIE)?.value;
  if (id) {
    const business = await prisma.business.findUnique({ where: { id } });
    if (business) return business;
  }
  return prisma.business.findFirst({ orderBy: { createdAt: "asc" } });
}

/** Redirects to onboarding when no business exists yet. */
export async function requireBusiness() {
  const business = await getActiveBusiness();
  if (!business) redirect("/settings/businesses");
  return business;
}
