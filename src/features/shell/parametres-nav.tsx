"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { isCurrentPage } from "@/features/shell/nav-entries";

type Entry = { href: string; label: string };

/** Onglets de sous-navigation (fondations « Onglets » : 32 px, soulignement accent 2 px) ; l'entrée courante porte `aria-current`. À 375 px, les onglets passent sur deux lignes plutôt que de défiler. */
export function ParametresNav({ entries }: { entries: readonly Entry[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections des paramètres" className="border-b">
      <ul className="-mb-px flex flex-wrap gap-x-4 text-base">
        {entries.map((entry) => {
          const current = isCurrentPage(pathname, entry.href);
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center border-b-2 px-1 transition-colors focus-visible:rounded-sm",
                  current ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
