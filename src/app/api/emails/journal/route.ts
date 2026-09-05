import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireSession, withApi } from "@/lib/auth/session";
import { listEmailLog } from "@/lib/mail/journal";

export const dynamic = "force-dynamic";

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "date attendue")
  .transform((value) => new Date(value));

const filtersSchema = z.object({
  status: z.enum(["capture", "envoye", "echec"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  objectType: z.string().trim().min(1).optional(),
  objectId: z.string().trim().min(1).optional(),
});

/** Journal des envois, lisible par tout membre (D11, D23) ; filtres en paramètres de requête. */
export const GET = withApi(async (request) => {
  await requireSession(request);
  const raw = Object.fromEntries(Array.from(new URL(request.url).searchParams.entries()).filter(([, v]) => v !== ""));
  const parsed = filtersSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "filtres_invalides", "Statut (capture, envoye, echec) et dates ISO attendus.");
  return NextResponse.json({ entries: await listEmailLog(parsed.data) });
});
