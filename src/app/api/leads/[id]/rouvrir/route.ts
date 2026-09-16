import { NextResponse } from "next/server";
import { reopenLead } from "@/features/leads/leads";
import { serializeRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Rouvre un lead écarté à « contacté », geste ouvert à tout membre (D7) : 404 inconnu, 409 archivé ou pas écarté ; le passage entre dans l'historique. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(serializeRecord(await reopenLead(id, { id: actor.id })));
});
