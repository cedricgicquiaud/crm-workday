import { NextResponse } from "next/server";
import { getCompany, updateCompany } from "@/features/companies/companies";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Une entreprise par son identifiant ; 404 si elle n'existe pas. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await getCompany(id));
});

/** Modification d'une entreprise par tout membre (D11) : 400 données invalides, 404 inconnue, 409 archivée ou SIREN déjà porté ; chaque champ changé entre dans l'historique. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await updateCompany(id, await request.json().catch(() => null), { id: actor.id }));
});
