import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { allowedEntries } from "@/features/shell/parametres-entries";

export const dynamic = "force-dynamic";

/** `/parametres` ouvre la première section permise au rôle : Comptes pour un administrateur, Journal pour un membre. */
export default async function ParametresPage() {
  const { user } = await requireSession();
  redirect(allowedEntries(user.role)[0].href);
}
