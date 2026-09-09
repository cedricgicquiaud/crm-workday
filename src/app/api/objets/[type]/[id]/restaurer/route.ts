import { NextResponse } from "next/server";
import { restoreRecord } from "@/features/archive/archive";
import { serializeRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

/** Restaure une fiche archivée, par tout membre (D21, contrat 30) : 404 type ou fiche inconnus, 409 si elle ne l'est pas. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { type, id } = await params;
  return NextResponse.json(serializeRecord(await restoreRecord(type, id, { id: actor.id })));
});
