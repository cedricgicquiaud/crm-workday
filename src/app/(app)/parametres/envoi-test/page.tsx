import { TestSendForm } from "@/features/emails/test-send-form";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Paramètres → Envoi de test, réservé aux administrateurs (contrat 16, CRM-25). */
export default async function Page() {
  const { user } = await requireAdmin();
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Envoi de test</h2>
        <p className="text-sm text-muted-foreground">Un email de test part avec l&apos;expéditeur du cabinet ; son sort est consigné dans le journal.</p>
      </div>
      <TestSendForm defaultTo={user.email} />
    </div>
  );
}
