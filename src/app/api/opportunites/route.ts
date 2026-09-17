import { NextResponse } from "next/server";
import { createOpportunity } from "@/features/opportunities/opportunities";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Création d'une opportunité par tout membre (D34) : 201 avec l'identifiant, 400 par champ. */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createOpportunity(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
