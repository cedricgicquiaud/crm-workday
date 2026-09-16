import { NextResponse } from "next/server";
import { createLead } from "@/features/leads/leads";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Création d'un lead par tout membre (D4, D22) : 201 avec l'identifiant, 400 par champ. */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createLead(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
