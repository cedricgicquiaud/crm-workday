import Link from "next/link";
import "@/features/objects/manifest.server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listForState } from "@/features/lists/apply-filters";
import { FilterChips } from "@/features/lists/filter-chips";
import { parseListState, searchParamsOf } from "@/features/lists/url-state";
import { fieldsOf } from "@/features/objects/fields";
import { displayValue, formatDate } from "@/features/objects/labels";
import { getObject } from "@/features/objects/registry";
import { listObjectRecords, listUserOptions } from "@/features/objects/service";
import { QuickCreateDialog } from "@/features/objects/quick-create-dialog";
import { requireSession } from "@/lib/auth/session";

/** Paramètres d'URL tels que Next.js les passe à une page. */
export type ListQuery = Record<string, string | string[] | undefined>;

/**
 * Liste dense d'un objet (D6) : titre `<h1>`, un seul bouton plein (la création), barre de filtres,
 * tableau à largeur fixe, pied avec compteur. Tout l'état — filtres, tri, colonnes, archivées — vit
 * dans l'URL (D18) : la page est rendue par le serveur à chaque adresse, et l'adresse se partage.
 * Un filtre que la liste ne sait pas appliquer est signalé « filtre inactif », jamais une erreur.
 */
export async function ObjectList({ type, query }: { type: string; query?: ListQuery }) {
  const state = parseListState(type, searchParamsOf(query));
  const [{ user }, records, users] = await Promise.all([requireSession(), listObjectRecords(type, { includeArchived: state.includeArchived }), listUserOptions()]);
  const shown = listForState(type, records, state, users);
  const definition = getObject(type);
  const fields = fieldsOf(type);
  const title = fields.find((field) => field.key === definition.titleField)!;
  const columns = state.columns.map((key) => fields.find((field) => field.key === key)!);
  const count = shown.length;
  return (
    <div className="grid gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{definition.labels.plural}</h1>
        <QuickCreateDialog type={type} users={users} currentUserId={user.id} />
      </header>
      <FilterChips type={type} state={state} users={users} />
      {state.inactive.length > 0 && (
        <div data-slot="list-warnings" className="grid gap-1">
          {state.inactive.map((entry) => (
            <p key={entry.message} role="status" className="rounded-r-md border-l-3 border-l-warning bg-warning-subtle/40 px-2.5 py-1 text-sm">
              {entry.message}
            </p>
          ))}
        </div>
      )}
      {count === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{`Aucune fiche pour l'instant. Créez la première avec « ${definition.labels.singular} ».`}</p>
      ) : (
        <Table aria-label={definition.labels.plural} className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-7">{title.label}</TableHead>
              {columns.map((column) => (
                <TableHead key={column.key} className="hidden h-7 w-[18%] md:table-cell">
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="h-7 w-28 text-right">Modifiée le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((record) => {
              const label = displayValue(title, record[title.key], users);
              return (
                <TableRow key={record.id} className="h-8">
                  <TableCell className="truncate py-1 font-medium" title={label}>
                    <Link href={definition.href(record.id)} className="hover:underline focus-visible:rounded-sm">
                      {label}
                    </Link>
                  </TableCell>
                  {columns.map((column) => {
                    const value = displayValue(column, record[column.key], users);
                    return (
                      <TableCell key={column.key} className="hidden truncate py-1 text-muted-foreground md:table-cell" title={value}>
                        {value}
                      </TableCell>
                    );
                  })}
                  <TableCell className="py-1 text-right tabular-nums text-muted-foreground">{formatDate(record.updatedAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-sm text-muted-foreground">{count === 1 ? `1 ${definition.labels.singular.toLowerCase()}` : `${count} ${definition.labels.plural.toLowerCase()}`}</p>
    </div>
  );
}
