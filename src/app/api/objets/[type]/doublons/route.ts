import { NextResponse } from "next/server";
import { duplicatesOfRecord, duplicatesOfValues } from "@/features/duplicates/duplicates";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string }> };

/** Paramètre qui désigne une fiche existante ; tous les autres sont les valeurs d'une fiche à créer. */
const RECORD_PARAM = "fiche";

/**
 * Doublons probables (D19, contrat 28) : ceux d'une fiche existante (`?fiche=<id>`, pour sa
 * bannière), ou ceux du nom qu'on est en train de saisir (les champs du dialogue de création passés
 * tels quels, `?name=ACME%20SAS`). Lecture ouverte à tout membre : le signal ne refuse rien, il
 * nomme. 401 sans session, 404 sur un type ou une fiche inconnus (D24).
 */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { type } = await params;
  const query = new URL(request.url).searchParams;
  const id = query.get(RECORD_PARAM);
  if (id) return NextResponse.json({ duplicates: await duplicatesOfRecord(type, id) });
  const values = Object.fromEntries([...query.entries()].filter(([key]) => key !== RECORD_PARAM));
  return NextResponse.json({ duplicates: await duplicatesOfValues(type, values) });
});
