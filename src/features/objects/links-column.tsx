import { cn } from "cn";
import { and, count, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import Link from "next/link";
import "@/features/objects/manifest.server";
import { QuickCreateDialog } from "@/features/objects/quick-create-dialog";
import { getObject, listObjects, type Relation } from "@/features/objects/registry";
import { getServerObject, type DependentLinks, type DependentTable, type LinkSubtitle } from "@/features/objects/registry.server";
import { listUserOptions } from "@/features/objects/service";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * `archived` : présent seulement sur une fiche liée archivée, avec la marque à écrire (« archivé », « archivée ») — une relation déclarée `keepArchived` en montre (D21).
 * `subtitle` : présent seulement quand l'objet lié le déclare pour ce groupe (l'étape d'une opportunité, D61).
 */
export type LinkedRecord = { id: string; title: string; href: string; archived?: string; subtitle?: string };
/** Création rapide depuis ce groupe (D7) : l'objet à créer et le champ pré-rempli avec la fiche courante. */
export type LinkedCreate = { type: string; prefill: Record<string, string> };
/** `more` : fiches liées au-delà de la borne, comptées mais pas chargées. */
export type LinkedGroup = { key: string; label: string; records: LinkedRecord[]; more?: number; create?: LinkedCreate };

/** Une fiche liée prête pour la colonne ; archivée, elle porte sa marque, accordée à l'article déclaré de son objet. */
function linkedRecord(objectKey: string, row: { id: unknown; title: unknown; archivedAt: unknown }, subtitle?: string): LinkedRecord {
  const definition = getObject(objectKey);
  const record = { id: String(row.id), title: String(row.title ?? ""), href: definition.href(String(row.id)), ...(subtitle ? { subtitle } : {}) };
  return row.archivedAt == null ? record : { ...record, archived: definition.labels.article === "un" ? "archivé" : "archivée" };
}

/** Le libellé d'une valeur de liste fermée, pour le sous-titre d'une fiche liée ; une valeur inconnue s'écrit telle quelle. */
const subtitleOf = ({ values }: LinkSubtitle, value: unknown): string => values.find((entry) => entry.value === value)?.label ?? String(value ?? "");

/** Fiches liées chargées au plus dans un groupe : une entreprise à trois cents contacts n'en affiche pas trois cents. */
export const LINKED_RECORDS_LIMIT = 20;

/**
 * Fiches d'un objet dont la colonne `fkColumn` vaut `id`, la dernière modifiée en tête, bornées ; `more`
 * compte celles qui restent. Les archivées sortent, sauf pour une relation déclarée `keepArchived`.
 */
async function recordsPointingTo(objectKey: string, fkColumn: string, id: string, keepArchived: boolean): Promise<{ records: LinkedRecord[]; more: number }> {
  const definition = getObject(objectKey);
  const { table, linkSubtitle } = getServerObject(objectKey);
  const subtitle = linkSubtitle?.relations.includes(fkColumn) ? linkSubtitle : null;
  const columns = getTableColumns(table);
  const linked = keepArchived ? eq(columns[fkColumn], id) : and(eq(columns[fkColumn], id), isNull(columns.archivedAt));
  const rows = await db
    .select({ id: columns.id, title: columns[definition.titleField], archivedAt: columns.archivedAt, ...(subtitle ? { subtitle: columns[subtitle.column] } : {}) })
    .from(table)
    .where(linked)
    .orderBy(desc(columns.updatedAt), desc(columns.id))
    .limit(LINKED_RECORDS_LIMIT);
  const records = rows.map((row) => linkedRecord(objectKey, row, subtitle ? subtitleOf(subtitle, row.subtitle) : undefined));
  /* Le compte n'est demandé que si la borne est atteinte : en dessous, les fiches chargées sont toutes celles qui existent. */
  if (records.length < LINKED_RECORDS_LIMIT) return { records, more: 0 };
  const [total] = await db.select({ value: count() }).from(table).where(linked);
  return { records, more: Math.max(Number(total?.value ?? records.length) - records.length, 0) };
}

/**
 * Fiches actives d'un objet reliées à `id` par une ligne de sa table dépendante déclarée `links`
 * (les opportunités où une personne est proposée), la dernière modifiée en tête, bornées ; le
 * sous-titre vient de la ligne (le résultat de la proposition).
 */
async function recordsThrough(objectKey: string, dependent: DependentTable, links: DependentLinks, id: string): Promise<{ records: LinkedRecord[]; more: number }> {
  const definition = getObject(objectKey);
  const { table } = getServerObject(objectKey);
  const columns = getTableColumns(table);
  const through = getTableColumns(dependent.table);
  const { subtitle } = links;
  const linked = and(eq(through[links.fkColumn], id), isNull(columns.archivedAt));
  const rows = await db
    .select({ id: columns.id, title: columns[definition.titleField], archivedAt: columns.archivedAt, ...(subtitle ? { subtitle: through[subtitle.column] } : {}) })
    .from(dependent.table)
    .innerJoin(table, eq(columns.id, through[dependent.fkColumn]))
    .where(linked)
    .orderBy(desc(columns.updatedAt), desc(columns.id))
    .limit(LINKED_RECORDS_LIMIT);
  const records = rows.map((row) => linkedRecord(objectKey, row, subtitle ? subtitleOf(subtitle, row.subtitle) : undefined));
  if (records.length < LINKED_RECORDS_LIMIT) return { records, more: 0 };
  const [total] = await db.select({ value: count() }).from(dependent.table).innerJoin(table, eq(columns.id, through[dependent.fkColumn])).where(linked);
  return { records, more: Math.max(Number(total?.value ?? records.length) - records.length, 0) };
}

/** La fiche désignée par la clé étrangère d'une relation (une au plus), ou rien si la colonne est vide. */
async function recordPointedBy(type: string, id: string, relation: Relation): Promise<LinkedRecord[]> {
  const { table } = getServerObject(type);
  const own = getTableColumns(table);
  const [source] = await db.select({ fk: own[relation.fkColumn] }).from(table).where(eq(own.id, id)).limit(1);
  if (!source?.fk) return [];
  const target = getObject(relation.to);
  const targetTable = getServerObject(relation.to).table;
  const columns = getTableColumns(targetTable);
  const [row] = await db.select({ id: columns.id, title: columns[target.titleField], archivedAt: columns.archivedAt }).from(targetTable).where(eq(columns.id, String(source.fk))).limit(1);
  return row ? [linkedRecord(relation.to, row)] : [];
}

/**
 * Groupes de la colonne des liens d'une fiche (D4) : un par relation déclarée par l'objet (vers la
 * fiche qu'il désigne) puis un par relation déclarée vers lui, par un autre objet ou par lui-même (les
 * fiches qui le désignent). Tout vient du registre : aucun objet n'est nommé ici. Un groupe inverse est
 * borné : au-delà de `LINKED_RECORDS_LIMIT`, il porte le nombre de fiches restantes (`more`).
 */
export async function linkedGroups(type: string, id: string): Promise<LinkedGroup[]> {
  const own = await Promise.all(
    getObject(type).relations.map(async (relation) => ({ key: `${type}-${relation.to}-${relation.fkColumn}`, label: relation.label, records: await recordPointedBy(type, id, relation) })),
  );
  const inverse = await Promise.all(
    listObjects()
      .flatMap((object) => object.relations.filter((relation) => relation.to === type).map((relation) => ({ object, relation })))
      .map(async ({ object, relation }) => {
        const { records, more } = await recordsPointingTo(object.key, relation.fkColumn, id, relation.keepArchived === true);
        return {
          group: {
            key: `${object.key}-${relation.fkColumn}`,
            label: relation.inverseLabel,
            ...(relation.prefill ? { create: { type: object.key, prefill: { [relation.prefill]: id } } } : {}),
            records,
            ...(more > 0 ? { more } : {}),
          },
          /* Une relation de trace (`keepArchived`) ne dit rien quand la fiche n'en a pas : son groupe vide ne s'affiche pas. */
          shown: relation.keepArchived !== true || records.length > 0,
        };
      }),
  );
  const through = await Promise.all(
    listObjects()
      .flatMap((object) =>
        (getServerObject(object.key).dependents ?? []).flatMap((dependent) => (dependent.links?.to === type ? [{ object, dependent, links: dependent.links }] : [])),
      )
      .map(async ({ object, dependent, links }) => {
        const { records, more } = await recordsThrough(object.key, dependent, links, id);
        return { key: `${object.key}-${links.fkColumn}`, label: links.label, records, ...(more > 0 ? { more } : {}) };
      }),
  );
  /* Un groupe lu par une table dépendante ne dit rien à qui n'y figure pas (une personne jamais proposée) : vide, il ne s'affiche pas. */
  return [...own, ...inverse.filter(({ shown }) => shown).map(({ group }) => group), ...through.filter((group) => group.records.length > 0)];
}

/** « Ajouter une entreprise », « Ajouter une personne », « Ajouter un … » pour un objet masculin : le déterminant vient de l'article déclaré. */
const addLabel = (objectKey: string) => {
  const { labels } = getObject(objectKey);
  return `Ajouter ${labels.article} ${labels.singular.toLowerCase()}`;
};

/**
 * Colonne des liens de la fiche (D4, D5) : un groupe par relation déclarée, vers cet objet ou depuis
 * lui, avec les fiches liées chargées par le registre. Un groupe inverse dont la relation déclare un
 * `prefill` offre la création rapide de la fiche liée, pré-remplie avec celle-ci (« ajouter un
 * contact », D7) : bouton secondaire, le bouton plein reste celui de la liste. Sans relation
 * déclarée, la colonne montre son état vide.
 */
export async function LinksColumn({ type, id, className, readOnly = false }: { type: string; id: string; className?: string; readOnly?: boolean }) {
  const [groups, users, { user }] = await Promise.all([linkedGroups(type, id), listUserOptions(), requireSession()]);
  return (
    <section aria-label="Liens" className={cn("grid min-w-0 content-start gap-3", className)}>
      <h2 className="text-base font-medium">Liens</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fiche liée pour l&apos;instant.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="grid justify-items-start gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
            {/* Fiche archivée : la création rapide disparaît — elle ne peut plus rattacher quoi que ce soit (D21). */}
            {group.create && !readOnly && <QuickCreateDialog type={group.create.type} users={users} currentUserId={user.id} prefill={group.create.prefill} trigger={{ label: addLabel(group.create.type), variant: "outline", size: "sm" }} />}
            {group.records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune fiche liée.</p>
            ) : (
              <ul className="grid gap-0.5">
                {group.records.map((record) => (
                  <li key={record.id} className="grid min-w-0 text-sm">
                    <span className="truncate" title={record.archived ? `${record.title} (${record.archived})` : record.title}>
                      <Link href={record.href} className="hover:underline focus-visible:rounded-sm">
                        {record.title}
                      </Link>
                      {record.archived && <span className="text-xs text-muted-foreground">{` (${record.archived})`}</span>}
                    </span>
                    {/* L'étape d'une opportunité, le résultat d'une proposition (D61) : sous le titre, pour qu'un titre long ne le cache pas. */}
                    {record.subtitle && (
                      <span className="truncate text-xs text-muted-foreground" title={record.subtitle}>
                        {record.subtitle}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {group.more ? <p className="text-xs text-muted-foreground">{`et ${group.more} autre${group.more > 1 ? "s" : ""}`}</p> : null}
          </section>
        ))
      )}
    </section>
  );
}
