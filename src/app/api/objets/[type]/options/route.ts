import { NextResponse } from "next/server";
import { listRecordOptions } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string }> };

/**
 * Fiches proposées par un sélecteur de relation (D7) : identifiant et titre des fiches actives
 * seulement, la dernière modifiée en tête, bornées. La liste complète d'un objet rendrait toutes les
 * fiches avec toutes leurs colonnes à chaque ouverture d'un dialogue. 404 si le type est inconnu (D24).
 */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { type } = await params;
  return NextResponse.json({ options: await listRecordOptions(type) });
});
