import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Gestion des comptes, réservée aux administrateurs : un membre est renvoyé vers Accueil (contrat 16). */
export default async function Page() {
  await requireAdmin();
  return (
    <div className="grid gap-2">
      <h2 className="text-base font-medium">Comptes</h2>
    </div>
  );
}
