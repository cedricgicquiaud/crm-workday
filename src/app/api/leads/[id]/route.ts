import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/features/leads/leads";
import { serializeRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Un lead par son identifiant ; 404 s'il n'existe pas. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(serializeRecord(await getLead(id)));
});

/** Modification d'un lead par tout membre (D7, D22) : 400 par champ, 404 inconnu, 409 archivé ; chaque champ changé entre dans l'historique. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(serializeRecord(await updateLead(id, await request.json().catch(() => null), { id: actor.id })));
});
