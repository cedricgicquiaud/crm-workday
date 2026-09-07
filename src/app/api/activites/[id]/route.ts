import { NextResponse } from "next/server";
import { z } from "zod";
import { setTaskDone } from "@/features/activities/activities";
import { HttpError, requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({ done: z.boolean() });

/** Coche ou décoche une tâche (contrat 12) : 400 corps invalide ou activité qui n'est pas une tâche, 404 inconnue, 409 fiche archivée. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "« Faite » attendu : vrai ou faux.");
  return NextResponse.json(await setTaskDone(id, parsed.data.done));
});
