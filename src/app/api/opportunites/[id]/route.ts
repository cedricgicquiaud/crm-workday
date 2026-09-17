import { NextResponse } from "next/server";
import { getOpportunity } from "@/features/opportunities/opportunities";
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
