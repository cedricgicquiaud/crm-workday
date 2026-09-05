import { TemplatesScreen } from "@/features/emails/templates-screen";
import { requireAdmin } from "@/lib/auth/session";
import { listTemplates } from "@/lib/mail/templates";

export const dynamic = "force-dynamic";

/** Paramètres → Modèles d'emails, réservé aux administrateurs (contrat 16, D22). */
export default async function Page() {
  await requireAdmin();
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Modèles d&apos;emails</h2>
        <p className="text-sm text-muted-foreground">Le sujet et le texte de chaque email envoyé par le CRM. Les modèles système ne se suppriment pas.</p>
      </div>
      <TemplatesScreen templates={await listTemplates()} />
    </div>
  );
}
