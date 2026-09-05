import { listAccounts } from "@/features/accounts/accounts";
import { AccountsScreen, type AccountRow } from "@/features/accounts/accounts-screen";
import type { Role } from "@/features/auth/accounts";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Gestion des comptes, réservée aux administrateurs : un membre est renvoyé vers Accueil (contrat 16). */
export default async function Page() {
  await requireAdmin();
  const accounts: AccountRow[] = (await listAccounts()).map(({ id, email, firstName, lastName, role, status }) => ({
    id,
    email,
    firstName,
    lastName,
    role: role as Role,
    status,
  }));
  return <AccountsScreen accounts={accounts} />;
}
