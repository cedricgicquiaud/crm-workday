import { NextResponse } from "next/server";
import { createConsultant } from "@/features/consultants/consultants";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Création d'un consultant, ouverte à tout membre (D11, D12) : la personne et son profil en une
 * transaction. 201 avec l'identifiant de la personne, 400 par champ, 409 adresse déjà portée
 * (le message nomme la personne qui la porte) ou société de facturation archivée.
 */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createConsultant(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
