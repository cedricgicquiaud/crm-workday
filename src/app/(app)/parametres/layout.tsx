import Link from "next/link";

/** Sous-navigation de Paramètres. Les cinq entrées sont fixées par le cadrage de la feature 1. */
export const PARAMETRES_ENTRIES = [
  { href: "/parametres/comptes", label: "Comptes", adminOnly: true },
  { href: "/parametres/cabinet", label: "Cabinet", adminOnly: true },
  { href: "/parametres/modeles", label: "Modèles d'emails", adminOnly: true },
  { href: "/parametres/journal", label: "Journal des envois", adminOnly: false },
  { href: "/parametres/envoi-test", label: "Envoi de test", adminOnly: true },
] as const;

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <nav aria-label="Sections des paramètres" className="flex flex-wrap gap-2 text-sm">
        {PARAMETRES_ENTRIES.map((e) => (
          <Link key={e.href} href={e.href} className="rounded-md border px-3 py-1.5 hover:bg-accent">
            {e.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}
