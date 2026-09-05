import { CabinetForm } from "@/features/cabinet/cabinet-form";
import { requireAdmin } from "@/lib/auth/session";
import { getCabinetSettings } from "@/lib/mail/settings";

export const dynamic = "force-dynamic";

/** Paramètres → Cabinet, réservé aux administrateurs : un membre est renvoyé vers Accueil (contrat 16). */
export default async function Page() {
  await requireAdmin();
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Cabinet</h2>
        <p className="text-sm text-muted-foreground">Le nom du cabinet et l&apos;expéditeur de tous les emails qui partent du CRM.</p>
      </div>
      <CabinetForm initial={await getCabinetSettings()} />
    </div>
  );
}
