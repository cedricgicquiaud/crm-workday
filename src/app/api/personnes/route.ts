import { NextResponse } from "next/server";
import { createPerson, listPersons } from "@/features/persons/persons";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Personnes non archivées, la dernière modifiée en tête (D6). */
export const GET = withApi(async (request) => {
  await requireSession(request);
  return NextResponse.json({ persons: await listPersons() });
});

/** Création d'une personne, ouverte à tout membre (D11) : 201 avec l'identifiant, 400 données invalides, 409 adresse déjà portée. */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createPerson(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
