import { NextResponse } from "next/server";
import { requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Liste des comptes, réservée aux administrateurs (contrat 16). */
export const GET = withApi(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ accounts: [] });
});
