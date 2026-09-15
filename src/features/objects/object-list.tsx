import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import Link from "next/link";
import "@/features/objects/manifest.server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArchivedBadge } from "@/features/lists/list-cards";
import { CustomFieldsSource } from "@/features/custom-fields/custom-fields-section";
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { listForState } from "@/features/lists/apply-filters";
import { ColumnMenu } from "@/features/lists/column-menu";
import { columnsOf } from "@/features/lists/columns";
import { FilterChips } from "@/features/lists/filter-chips";
import { ListCell } from "@/features/lists/inline-edit";
import { ListCards } from "@/features/lists/list-cards";
import { isSortable, UPDATED_AT, type Sort } from "@/features/lists/sort";
import { listUrl, searchParamsOf, type ListState } from "@/features/lists/url-state";
import { createLabel as createButtonLabel, displayValue, formatDate } from "@/features/objects/labels";
import { getList, getObject, type ListDefinition, type ObjectLabels } from "@/features/objects/registry";
import { listObjectRecords, listUserOptions } from "@/features/objects/service";
import { QuickCreateDialog } from "@/features/objects/quick-create-dialog";
import { listPinnedViews } from "@/features/views/pinned";
import { ViewBar } from "@/features/views/view-bar";
import { listStateWithView, listViews } from "@/features/views/views";
import { requireSession } from "@/lib/auth/session";

/** Libellé de la création : celui que la liste déclare, sinon « Nouvelle … » de l'objet. */
const createLabel = (list: ListDefinition, labels: ObjectLabels) => (list.create === false ? "" : list.create?.label ?? createButtonLabel(labels));

/** Paramètres d'URL tels que Next.js les passe à une page. */
export type ListQuery = Record<string, string | string[] | undefined>;

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/** Valeur brute d'un champ, telle que la cellule la renverra au serveur. */
const rawValue = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** Le tri suivant au clic : le même champ change de sens, un autre champ commence croissant. */
const nextSort = (sort: Sort, field: string): Sort => ({ field, direction: sort.field === field && sort.direction === "asc" ? "desc" : "asc" });

/**
 * En-tête de colonne : un lien qui trie quand le champ le permet (D6), sinon le libellé seul.
 * Le tri passe par l'URL, donc il fonctionne sans JavaScript et se partage avec l'adresse.
 */
function ColumnHeader({ list, type, state, field, label, className }: { list: string; type: string; state: ListState; field: string; label: string; className: string }) {
  if (!isSortable(type, field)) return <TableHead className={className}>{label}</TableHead>;
  const current = state.sort.field === field ? state.sort.direction : null;
  return (
    <TableHead className={className} aria-sort={current ? ARIA_SORT[current] : "none"}>
      <Link href={listUrl(list, { ...state, sort: nextSort(state.sort, field) })} className="inline-flex max-w-full items-center gap-1 rounded-sm hover:underline">
        <span className="truncate">{label}</span>
        {current === "asc" && <ArrowUpIcon className="size-3 shrink-0" aria-hidden />}
        {current === "desc" && <ArrowDownIcon className="size-3 shrink-0" aria-hidden />}
      </Link>
    </TableHead>
  );
}

/**
 * Liste dense d'un objet (D6) : titre `<h1>`, un seul bouton plein (la création), barre des vues,
 * barre de filtres, tableau à largeur fixe, pied avec compteur. Tout l'état — vue, filtres, tri,
 * colonnes, archivées — vit dans l'URL (D18) : la page est rendue par le serveur à chaque adresse,
 * et l'adresse se partage.
 * Un filtre que la liste ne sait pas appliquer est signalé « filtre inactif », jamais une erreur.
 */
export async function ObjectList({ type: listKey, query }: { type: string; query?: ListQuery }) {
  /* Les champs personnalisés avant de lire l'URL : un filtre, un tri ou une colonne posés sur l'un d'eux se lisent comme un champ déclaré (2.4). */
  const customFields = await loadCustomFields();
  const list = getList(listKey);
  const type = list.objectKey;
  const state = await listStateWithView(listKey, searchParamsOf(query));
  const [{ user }, records, users, views] = await Promise.all([requireSession(), listObjectRecords(type, { includeArchived: state.includeArchived }), listUserOptions(), listViews(listKey)]);
  const pinned = await listPinnedViews(user.id);
  /* Le filtre de base de la liste s'applique ici, côté serveur : l'URL peut ajouter un filtre, jamais retirer celui-là (D10). */
  const shown = listForState(listKey, records, state, users);
  const definition = getObject(type);
  const fields = columnsOf(listKey);
  const title = fields.find((field) => field.key === definition.titleField)!;
  const columns = state.columns.map((key) => fields.find((field) => field.key === key)!);
  const count = shown.length;
  const singular = (list.singular ?? definition.labels.singular).toLowerCase();
  return (
    <div className="grid gap-4">
      <CustomFieldsSource definitions={customFields} />
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{list.label}</h1>
        {list.create !== false && <QuickCreateDialog type={type} create={list.create} users={users} currentUserId={user.id} />}
      </header>
      <ViewBar list={listKey} state={state} views={views} pinned={pinned} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterChips list={listKey} type={type} state={state} users={users} />
        {/* Choisir des colonnes n'a pas de sens en cartes : le menu suit le tableau (D9). */}
        <div className="hidden md:block">
          <ColumnMenu list={listKey} type={type} state={state} />
        </div>
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
          {state.filters.length > 0 ? "Aucune fiche ne répond à ces filtres." : `Aucune fiche pour l'instant. Créez la première avec « ${createLabel(list, definition.labels)} ».`}
        </p>
      ) : (
        <>
          {/* Sous 768 px, les cartes remplacent le tableau : la page ne défile jamais en largeur (D9). */}
          <ListCards type={type} records={shown} columns={columns.filter((column) => column.key !== UPDATED_AT)} users={users} />
          <div className="hidden md:block">
            <Table aria-label={list.label} className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <ColumnHeader list={listKey} type={type} state={state} field={title.key} label={title.label} className="h-7" />
                  {columns.map((column) => (
                    <ColumnHeader key={column.key} list={listKey} type={type} state={state} field={column.key} label={column.label} className={column.key === UPDATED_AT ? "h-7 w-28 text-right" : "h-7 w-[18%]"} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((record) => {
                  const label = displayValue(title, record[title.key], users);
                  return (
                    <TableRow key={record.id} className="h-8">
                      <TableCell className="py-1 font-medium" title={label}>
                        {/* La fiche archivée porte sa marque en toutes lettres : la couleur seule ne dit rien (CRM-68, fondations « Signalement »). */}
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Link href={definition.href(record.id)} className="truncate hover:underline focus-visible:rounded-sm">
                            {label}
                          </Link>
                          {record.archivedAt != null && <ArchivedBadge type={type} />}
                        </span>
                      </TableCell>
                      {columns.map((column) =>
                        /* La colonne de base ne se saisit pas : la liste la rend elle-même, en date courte alignée à droite. */
                        column.key === UPDATED_AT ? (
                          <TableCell key={column.key} className="py-1 text-right tabular-nums text-muted-foreground">
                            {formatDate(record.updatedAt)}
                          </TableCell>
                        ) : (
                          <TableCell key={column.key} className="truncate py-1 text-muted-foreground">
                            <ListCell type={type} id={record.id} field={column} value={rawValue(record[column.key])} users={users} />
                          </TableCell>
                        ),
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">{count === 1 ? `1 ${singular}` : `${count} ${list.label.toLowerCase()}`}</p>
    </div>
  );
}
