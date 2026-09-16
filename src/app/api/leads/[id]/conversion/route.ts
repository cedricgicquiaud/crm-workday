import { NextResponse } from "next/server";
import { convertLead } from "@/features/leads/conversion";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Conversion d'un lead par tout membre (D14, D22) : 400 par champ, 404 inconnu, 409 archivé, converti, écarté ou fiche archivée. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await convertLead(id, await request.json().catch(() => null), { id: actor.id }));
});
