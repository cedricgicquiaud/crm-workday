import { NextResponse } from "next/server";
import { createActivity } from "@/features/activities/activities";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

/** Ajoute une activité à une fiche (D10) : 201, 400 données invalides, 404 type ou fiche inconnus. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { type, id } = await params;
  const record = await createActivity(type, id, await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json(record, { status: 201 });
});
