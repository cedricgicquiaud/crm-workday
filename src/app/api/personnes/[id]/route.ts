import { NextResponse } from "next/server";
import { getPerson, updatePerson } from "@/features/persons/persons";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Une personne par son identifiant, avec ses autres adresses ; 404 si elle n'existe pas. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await getPerson(id));
});

/** Modification par tout membre (D11) : 400 données invalides ou champ dérivé, 404 inconnue, 409 archivée ou adresse déjà portée ; chaque champ changé entre dans l'historique. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await updatePerson(id, await request.json().catch(() => null), { id: actor.id }));
});
