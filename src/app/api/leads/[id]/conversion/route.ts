import { NextResponse } from "next/server";
import { convertLead, previewConversion } from "@/features/leads/conversion";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Paramètre d'adresse qui porte la saisie du champ « Entreprise » : les propositions suivent la frappe (D15). */
const COMPANY_QUERY = "entreprise";

/** Aperçu de la conversion pour la fenêtre (D15, D22) : personne, entreprises proposées, différences ; 404 inconnu, 409 si le lead ne se convertit pas. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await previewConversion(id, new URL(request.url).searchParams.get(COMPANY_QUERY)));
});

/** Conversion d'un lead par tout membre (D14, D22) : 400 par champ, 404 inconnu, 409 archivé, converti, écarté ou fiche archivée. */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await convertLead(id, await request.json().catch(() => null), { id: actor.id }));
});
