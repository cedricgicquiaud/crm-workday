import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/mail/templates";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ key: string }> };

/** Un modèle, avec ses variables obligatoires. */
export const GET = withApi(async (request, { params }: Context) => {
  await requireAdmin(request);
  const template = await getTemplate((await params).key);
  if (!template) throw new HttpError(404, "modele_introuvable", "Ce modèle n'existe pas.");
  return NextResponse.json({ template });
});

const textSchema = z.object({ subject: z.string().trim().min(1), body: z.string().trim().min(1) });

/** Sujet et corps : variable inconnue ou obligatoire absente → 400 avec son nom (contrats 31, 32). */
export const PUT = withApi(async (request, { params }: Context) => {
  await requireAdmin(request);
  const parsed = textSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Le sujet et le corps sont requis.");
  await updateTemplate((await params).key, parsed.data);
  return NextResponse.json({ ok: true });
});

/** Un modèle système répond 409 (contrat 32). */
export const DELETE = withApi(async (request, { params }: Context) => {
  await requireAdmin(request);
  await deleteTemplate((await params).key);
  return NextResponse.json({ ok: true });
});
