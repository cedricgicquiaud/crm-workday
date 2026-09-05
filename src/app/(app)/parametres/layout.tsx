import { allowedEntries } from "@/features/shell/parametres-entries";
import { ParametresNav } from "@/features/shell/parametres-nav";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Paramètres : titre et sous-navigation filtrée par le rôle lu dans la session (CRM-30). */
export default async function ParametresLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <ParametresNav entries={allowedEntries(user.role)} />
      <div>{children}</div>
    </div>
  );
}
