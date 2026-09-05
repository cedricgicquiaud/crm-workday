import { NextResponse } from "next/server";
import { requireAdmin, withApi } from "@/lib/auth/session";
import { listTemplates } from "@/lib/mail/templates";

export const dynamic = "force-dynamic";

/** Liste des modèles d'emails, réservée aux administrateurs (D11, D22). */
export const GET = withApi(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ templates: await listTemplates() });
});
