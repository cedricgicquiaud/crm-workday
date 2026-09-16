import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cellText, displayValue, EMPTY } from "@/features/objects/labels";
import type { UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";
import type { ObjectRecord } from "@/features/objects/service";

/**
 * Marque d'une fiche archivée dans une liste (CRM-68) : sans elle, l'interrupteur « Archivées »
 * allumé, rien ne distingue une fiche rangée d'une fiche vivante — même fond, même texte. Ton
 * inerte des fondations, et le mot en toutes lettres : aucune information portée par la couleur seule.
 */
export function ArchivedBadge({ type }: { type: string }) {
  const { labels } = getObject(type);
  return (
    <Badge variant="outline" className="shrink-0 border-border bg-muted text-muted-foreground">
      {labels.article === "une" ? "Archivée" : "Archivé"}
    </Badge>
  );
}

type Props = { type: string; records: readonly ObjectRecord[]; columns: readonly FieldDescriptor[]; users: readonly UserOption[] };

/**
 * La liste sur téléphone (D9, contrat 27) : une carte par fiche — le titre, puis les colonnes
 * choisies (type ou entreprise, responsable) — au lieu d'un tableau dense qui ne tient pas dans
 * 375 px. Aucune édition en place ici : elle est réservée à l'ordinateur. Les cartes remplacent le
 * tableau sous 768 px, jamais à côté : la page ne défile pas en largeur.
 */
export function ListCards({ type, records, columns, users }: Props) {
  const definition = getObject(type);
  const title = definition.fields.find((field) => field.key === definition.titleField)!;
  return (
    <ul aria-label={definition.labels.plural} className="grid min-w-0 gap-2 md:hidden">
      {records.map((record) => {
        const label = displayValue(title, record[title.key], users);
        return (
          <li key={record.id} className="min-w-0 rounded-lg border p-2.5">
            <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium" title={label}>
              <Link href={definition.href(record.id)} className="truncate hover:underline">
                {label}
              </Link>
              {record.archivedAt != null && <ArchivedBadge type={type} />}
            </h2>
            {columns.length > 0 && (
              <dl className="mt-1 grid min-w-0 grid-cols-[auto_1fr] gap-x-2 text-xs text-muted-foreground">
                {columns.map((column) => {
                  /* La phrase même du tableau : l'état avec sa date, les modules certifiés marqués ✔. */
                  const value = cellText(column, record, users);
                  return (
                    <div key={column.key} className="col-span-2 grid min-w-0 grid-cols-subgrid">
                      <dt className="truncate">{column.label}</dt>
                      <dd className="truncate" title={value === EMPTY ? undefined : value}>
                        {value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
