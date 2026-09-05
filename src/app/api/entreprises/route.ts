import { NextResponse } from "next/server";
import { createCompany, listCompanies } from "@/features/companies/companies";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Entreprises non archivées, la dernière modifiée en tête (D6). */
export const GET = withApi(async (request) => {
  await requireSession(request);
  return NextResponse.json({ companies: await listCompanies() });
});

/** Création d'une entreprise, ouverte à tout membre (D11) : 201 avec l'identifiant, 400 données invalides, 409 SIREN déjà porté. */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createCompany(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
