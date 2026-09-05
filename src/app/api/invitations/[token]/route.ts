import { z } from "zod";
import { acceptInvitation } from "@/features/auth/invitations";
import { getAuth } from "@/lib/auth";
import { HttpError, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

const bodySchema = z.object({ password: z.string() });

/** Acceptation d'une invitation : choix du mot de passe puis connexion immédiate (contrat 6). */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Le mot de passe est requis.");
  const { email } = await acceptInvitation(token, parsed.data.password);
  return getAuth().api.signInEmail({ body: { email, password: parsed.data.password }, headers: request.headers, asResponse: true });
});
