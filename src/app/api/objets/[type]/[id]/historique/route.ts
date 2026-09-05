import { NextResponse } from "next/server";
import { listHistory } from "@/features/history/history";
import { getObjectRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

/** Historique d'une fiche, la plus récente d'abord (D12) ; 404 si le type ou la fiche est inconnu. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { type, id } = await params;
  await getObjectRecord(type, id);
  return NextResponse.json({ entries: await listHistory(type, id) });
});

/** Une entrée d'historique ne se modifie pas et ne se supprime pas (contrat 15). */
const refuse = withApi<[Context]>(async () => NextResponse.json({ error: "historique_immuable", message: "L'historique ne se modifie pas et ne se supprime pas." }, { status: 405, headers: { allow: "GET" } }));

export const PATCH = refuse;
export const DELETE = refuse;
