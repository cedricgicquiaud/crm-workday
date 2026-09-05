import { listAccounts } from "@/features/accounts/accounts";
import { AccountsScreen } from "@/features/accounts/accounts-screen";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Gestion des comptes, réservée aux administrateurs : un membre est renvoyé vers Accueil (contrat 16). */
export default async function Page() {
  await requireAdmin();
  return <AccountsScreen accounts={await listAccounts()} />;
}
