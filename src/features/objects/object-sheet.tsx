import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";
import "@/features/objects/manifest.server";
import { Badge } from "@/components/ui/badge";
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { CustomFieldsSource } from "@/features/custom-fields/custom-fields-section";
import { ActivityFeed, SheetPanes } from "@/features/activities/activity-feed";
import { listFeed } from "@/features/activities/feed";
import { SheetBanners } from "@/features/objects/banners";
import { fieldsOf } from "@/features/objects/fields";
import { FieldsSection } from "@/features/objects/fields-section";
import { displayValue, formatDate } from "@/features/objects/labels";
import { LinksColumn } from "@/features/objects/links-column";
import { ObjectActionsMenu } from "@/features/objects/object-actions-menu";
import { getObject } from "@/features/objects/registry";
import { getServerObject, sectionsOf, visibleActions } from "@/features/objects/registry.server";
import { getObjectRecord, listUserOptions, serializeRecord, type ObjectRecord } from "@/features/objects/service";
import { HttpError, requireSession } from "@/lib/auth/session";

/** La fiche se lit par le chargeur que l'objet déclare, sinon par la lecture générique du service. */
async function loadRecord(type: string, id: string): Promise<ObjectRecord> {
  const declared = getServerObject(type).loadRecord;
  try {
    return await (declared ? declared(id) : getObjectRecord(type, id));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}

/**
 * Fiche d'un objet (D5, fondations « Briques de fiche ») : bannière de signalement en haut du
 * contenu, puis trois colonnes — liens à gauche (260 px), champs éditables en place au centre, fil
 * d'activité à droite (380 px), où les changements de champs entrent comme un type d'entrée parmi
 * les autres. Sous 1280 px la colonne de gauche se replie ; sous 900 px tout passe en une colonne et
 * le fil devient un onglet. En-tête : titre `<h1>`, badge de type et badges de tête déclarés par
 * l'objet (« Profils : Contact »). Sous « Champs », les sections que l'objet déclare, par rang
 * croissant (D20) : la fiche les charge et leur passe leurs données, aucune ne relit pour son compte.
 */
export async function ObjectSheet({ type, id }: { type: string; id: string }) {
  const definition = getObject(type);
  /* Les champs personnalisés d'abord : la fiche et ses briques les lisent comme des champs déclarés (2.4). */
  const customFields = await loadCustomFields();
  const record = await loadRecord(type, id);
  /* Fiche absorbée par une fusion : son adresse mène à la fiche conservée (contrat 29). */
  if (record.id !== id) redirect(definition.href(record.id));
  const sections = sectionsOf(type);
  const [users, session, sectionData] = await Promise.all([listUserOptions(), requireSession(), Promise.all(sections.map((section) => section.load(id)))]);
  /* Les options d'utilisateurs sont lues une fois pour la fiche, puis passées au fil : il ne les relit pas. */
  const feed = await listFeed(type, id, users);
  const fields = fieldsOf(type);
  const title = displayValue(fields.find((f) => f.key === definition.titleField)!, record[definition.titleField], users);
  const owner = fields.find((f) => f.type === "user" && f.key === "ownerId");
  const headerFields = (definition.headerFields ?? []).map((key) => fields.find((field) => field.key === key)!);
  /* Fiche archivée : elle se lit, elle ne s'écrit plus (D21) — champs en texte, composeur et créations rapides retirés. */
  const archived = record.archivedAt != null;
  const isAdmin = session.user.role === "administrateur";
  const serialized = serializeRecord(record);
  const fieldsSection = <FieldsSection type={type} record={serialized} users={users} readOnly={archived} />;
  /* Gestes propres à l'objet (D21), visibles selon la fiche : à côté du menu commun, jamais dedans. */
  const actions = visibleActions(type, record);
  return (
    <div className="grid gap-6">
      <CustomFieldsSource definitions={customFields} />
      <header className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            <definition.icon aria-hidden />
            {definition.labels.singular}
          </Badge>
          {headerFields.map((field) => (
            <Badge key={field.key} variant="outline" className="border-border">{`${field.label} : ${displayValue(field, record[field.key], users)}`}</Badge>
          ))}
          <div className="ml-auto flex flex-wrap items-start justify-end gap-2">
            {actions.map((action) => (
              <Fragment key={action.key}>{action.render({ id, record: serialized })}</Fragment>
            ))}
            <ObjectActionsMenu type={type} id={id} title={title} archived={archived} canDelete={isAdmin} />
          </div>
        </div>
        <p className="tabular text-sm text-muted-foreground">
          {`Créée le ${formatDate(record.createdAt)} · modifiée le ${formatDate(record.updatedAt)}`}
          {owner ? ` · responsable : ${displayValue(owner, record.ownerId, users)}` : ""}
        </p>
      </header>
      <SheetBanners type={type} id={id} showAction={isAdmin} />
      <SheetPanes
        feedCount={feed.items.length}
        links={<LinksColumn type={type} id={id} readOnly={archived} />}
        main={
          /* Sans section déclarée, la colonne centrale est la section des champs : pas d'enveloppe pour rien. */
          sections.length === 0 ? (
            fieldsSection
          ) : (
            <div className="grid min-w-0 content-start gap-6">
              {fieldsSection}
              {sections.map((section, index) => (
                <Fragment key={section.key}>{section.render({ id, data: sectionData[index], readOnly: archived })}</Fragment>
              ))}
            </div>
          )
        }
        feed={<ActivityFeed type={type} id={id} items={feed.items} more={feed.more} users={users} currentUserId={session.user.id} readOnly={archived} />}
      />
    </div>
  );
}
