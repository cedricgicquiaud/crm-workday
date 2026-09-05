import { NextResponse } from "next/server";
import { z } from "zod";
import { createInvitation } from "@/features/auth/invitations";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  role: z.enum(["administrateur", "membre"]),
});

/** Création d'une invitation par un administrateur (D7). */
export const POST = withApi(async (request) => {
  const { user: admin } = await requireAdmin(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Email, prénom, nom et rôle sont requis.");
  const { userId } = await createInvitation({ ...parsed.data, authorId: admin.id });
  return NextResponse.json({ userId }, { status: 201 });
});
