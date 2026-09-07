import { NextResponse } from "next/server";
import { createActivity } from "@/features/activities/activities";
import { listFeed } from "@/features/activities/feed";
import { getObjectRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

/** Fil d'une fiche, la plus récente d'abord (D11) ; 404 si le type ou la fiche est inconnu. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { type, id } = await params;
  await getObjectRecord(type, id);
  return NextResponse.json({ entries: await listFeed(type, id) });
});

/** Ajoute une activité à une fiche (D10) : 201, 400 données invalides, 404 type ou fiche inconnus. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { type, id } = await params;
  const record = await createActivity(type, id, await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json(record, { status: 201 });
});
