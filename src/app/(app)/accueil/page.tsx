import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Accueil : salutation par le prénom, date courte du jour en Europe/Paris (« 5 sept. 2026 »), emplacement du futur tableau de bord (D5). */
export default async function AccueilPage() {
  const { user } = await requireSession();
  const today = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{`Bonjour ${user.firstName}`.trim()}</h1>
        <p className="tabular text-sm text-muted-foreground">{today}</p>
      </header>
      <section aria-label="Tableau de bord" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Le tableau de bord (pipeline, missions, factures) arrive avec les features suivantes.
      </section>
    </div>
  );
}
