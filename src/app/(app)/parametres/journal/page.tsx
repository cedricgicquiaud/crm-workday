import { JournalScreen } from "@/features/emails/journal-screen";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Paramètres → Journal des envois, lisible par tout membre (D11, D23) ; « Renvoyer » reste un geste d'administrateur. */
export default async function Page() {
  const { user } = await requireSession();
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Journal des envois</h2>
        <p className="text-sm text-muted-foreground">Chaque email parti du CRM, son sort et son auteur. En développement, les emails sont capturés : rien ne part.</p>
      </div>
      <JournalScreen canResend={user.role === "administrateur"} />
    </div>
  );
}
