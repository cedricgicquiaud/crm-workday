import { NextResponse } from "next/server";
import { getOpportunity, updateOpportunity } from "@/features/opportunities/opportunities";
import { serializeRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Une opportunité par son identifiant ; 404 si elle n'existe pas. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(serializeRecord(await getOpportunity(id)));
});

/** Modification d'une opportunité par tout membre (D34) : 400 par champ, 404 inconnue, 409 archivée. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(serializeRecord(await updateOpportunity(id, await request.json().catch(() => null), { id: actor.id })));
});
