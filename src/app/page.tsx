import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** `/` : Accueil s'il y a une session, sinon la page de connexion (contrat 2). */
export default async function RootPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  redirect(session ? "/accueil" : "/connexion");
}
