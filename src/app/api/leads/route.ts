import { NextResponse } from "next/server";
import { createLead, listLeads } from "@/features/leads/leads";
import { serializeRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Leads non archivés, tous avancements confondus, le dernier modifié en tête : la liste filtrée et triée passe par `/api/objets/lead`. */
export const GET = withApi(async (request) => {
  await requireSession(request);
  return NextResponse.json({ leads: (await listLeads()).map(serializeRecord) });
});

/** Création d'un lead par tout membre (D4, D22) : 201 avec l'identifiant, 400 par champ. */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createLead(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
