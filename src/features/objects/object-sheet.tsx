import { notFound } from "next/navigation";
import "@/features/objects/manifest.server";
import { Badge } from "@/components/ui/badge";
import { HistoryList } from "@/features/history/history-list";
import { fieldsOf } from "@/features/objects/fields";
import { FieldsSection } from "@/features/objects/fields-section";
import { displayValue, formatDate } from "@/features/objects/labels";
import { LinksColumn } from "@/features/objects/links-column";
import { getObject } from "@/features/objects/registry";
import { getObjectRecord, listUserOptions, serializeRecord, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";

async function loadRecord(type: string, id: string): Promise<ObjectRecord> {
  try {
    return await getObjectRecord(type, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}

/**
 * Fiche d'un objet en trois colonnes (D5, fondations « Briques de fiche ») : liens à gauche (260 px),
 * champs éditables en place au centre, historique à droite (380 px). Sous 1280 px la colonne de gauche
 * se replie ; sous 900 px tout passe en une colonne. En-tête : titre `<h1>` et badge de type.
 */
export async function ObjectSheet({ type, id }: { type: string; id: string }) {
  const definition = getObject(type);
  const [record, users] = await Promise.all([loadRecord(type, id), listUserOptions()]);
  const fields = fieldsOf(type);
  const title = displayValue(fields.find((f) => f.key === definition.titleField)!, record[definition.titleField], users);
  const owner = fields.find((f) => f.type === "user" && f.key === "ownerId");
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            <definition.icon aria-hidden />
            {definition.labels.singular}
          </Badge>
        </div>
        <p className="tabular text-sm text-muted-foreground">
          {`Créée le ${formatDate(record.createdAt)} · modifiée le ${formatDate(record.updatedAt)}`}
          {owner ? ` · responsable : ${displayValue(owner, record.ownerId, users)}` : ""}
        </p>
      </header>
      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_var(--pane-right-w)] xl:grid-cols-[var(--pane-left-w)_minmax(0,1fr)_var(--pane-right-w)]">
        <LinksColumn type={type} className="min-[900px]:hidden xl:block" />
        <FieldsSection type={type} record={serializeRecord(record)} users={users} />
        <section aria-label="Historique" className="grid content-start gap-3">
          <h2 className="text-base font-medium">Historique</h2>
          <HistoryList type={type} id={id} users={users} />
        </section>
      </div>
    </div>
  );
}
