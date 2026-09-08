import { NextResponse } from "next/server";
import { archiveRecord } from "@/features/archive/archive";
import { serializeRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

/** Archive une fiche, par tout membre (D21, contrat 30) : 404 type ou fiche inconnus, 409 déjà archivée. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { type, id } = await params;
  return NextResponse.json(serializeRecord(await archiveRecord(type, id, { id: actor.id })));
});
