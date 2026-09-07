import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const SEARCH_MIN_LENGTH = 3;
const SEARCH_MAX_LENGTH = 120;

const querySchema = z.string().trim().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH);

/** Recherche transverse pour la palette Cmd+K (D8) : session requise, `q` de 3 à 120 caractères. */
export const GET = withApi(async (request) => {
  await requireSession(request);
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) throw new HttpError(400, "requete_invalide", `La recherche attend de ${SEARCH_MIN_LENGTH} à ${SEARCH_MAX_LENGTH} caractères.`);
  return NextResponse.json({ results: [] });
});
