import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import Link from "next/link";
import "@/features/objects/manifest.server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listForState } from "@/features/lists/apply-filters";
import { ColumnMenu } from "@/features/lists/column-menu";
import { FilterChips } from "@/features/lists/filter-chips";
import { isSortable, UPDATED_AT, type Sort } from "@/features/lists/sort";
import { listUrl, parseListState, searchParamsOf, type ListState } from "@/features/lists/url-state";
import { fieldsOf } from "@/features/objects/fields";
import { displayValue, formatDate } from "@/features/objects/labels";
import { getObject } from "@/features/objects/registry";
import { listObjectRecords, listUserOptions } from "@/features/objects/service";
import { QuickCreateDialog } from "@/features/objects/quick-create-dialog";
import { requireSession } from "@/lib/auth/session";

/** Paramètres d'URL tels que Next.js les passe à une page. */
export type ListQuery = Record<string, string | string[] | undefined>;

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/** Le tri suivant au clic : le même champ change de sens, un autre champ commence croissant. */
const nextSort = (sort: Sort, field: string): Sort => ({ field, direction: sort.field === field && sort.direction === "asc" ? "desc" : "asc" });

/**
 * En-tête de colonne : un lien qui trie quand le champ le permet (D6), sinon le libellé seul.
 * Le tri passe par l'URL, donc il fonctionne sans JavaScript et se partage avec l'adresse.
 */
function ColumnHeader({ type, state, field, label, className }: { type: string; state: ListState; field: string; label: string; className: string }) {
  if (!isSortable(type, field)) return <TableHead className={className}>{label}</TableHead>;
  const current = state.sort.field === field ? state.sort.direction : null;
  return (
    <TableHead className={className} aria-sort={current ? ARIA_SORT[current] : "none"}>
      <Link href={listUrl(type, { ...state, sort: nextSort(state.sort, field) })} className="inline-flex max-w-full items-center gap-1 rounded-sm hover:underline">
        <span className="truncate">{label}</span>
        {current === "asc" && <ArrowUpIcon className="size-3 shrink-0" aria-hidden />}
        {current === "desc" && <ArrowDownIcon className="size-3 shrink-0" aria-hidden />}
      </Link>
    </TableHead>
  );
}

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterChips type={type} state={state} users={users} />
        <ColumnMenu type={type} state={state} />
      </div>
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
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {state.filters.length > 0 ? "Aucune fiche ne répond à ces filtres." : `Aucune fiche pour l'instant. Créez la première avec « ${definition.labels.singular} ».`}
        </p>
      ) : (
        <Table aria-label={definition.labels.plural} className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ColumnHeader type={type} state={state} field={title.key} label={title.label} className="h-7" />
              {columns.map((column) => (
                <ColumnHeader key={column.key} type={type} state={state} field={column.key} label={column.label} className="hidden h-7 w-[18%] md:table-cell" />
              ))}
              <ColumnHeader type={type} state={state} field={UPDATED_AT} label="Modifiée le" className="h-7 w-28 text-right" />
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
