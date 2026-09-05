import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Paramètres → Modèles d'emails, réservé aux administrateurs (contrat 16). */
export default async function Page() {
  await requireAdmin();
  return (
    <div className="grid gap-2">
      <h2 className="text-base font-medium">Modèles d&apos;emails</h2>
      <p className="text-sm text-muted-foreground">À venir.</p>
    </div>
  );
}
