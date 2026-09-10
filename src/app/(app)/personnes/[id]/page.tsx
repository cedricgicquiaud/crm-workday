import { notFound, redirect } from "next/navigation";
import "@/features/objects/manifest.server";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed, SheetPanes } from "@/features/activities/activity-feed";
import { CustomFieldsSource } from "@/features/custom-fields/custom-fields-section";
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { listFeed } from "@/features/activities/feed";
import { fieldsOf } from "@/features/objects/fields";
import { FieldsSection } from "@/features/objects/fields-section";
import { displayValue, formatDate } from "@/features/objects/labels";
import { LinksColumn } from "@/features/objects/links-column";
import { ObjectActionsMenu } from "@/features/objects/object-actions-menu";
import { SheetBanners } from "@/features/objects/banners";
import { getObject } from "@/features/objects/registry";
import { listRecordOptions, listUserOptions, serializeRecord } from "@/features/objects/service";
import { getContactProfile } from "@/features/persons/contact-profile";
import { ContactProfileSection } from "@/features/persons/contact-profile-section";
import { getPerson, type PersonRecord } from "@/features/persons/persons";
import { HttpError, requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const TYPE = "person";

async function loadPerson(id: string): Promise<PersonRecord> {
  try {
    return await getPerson(id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}

/**
 * Fiche d'une personne en trois colonnes (D5), composée ici plutôt que par `ObjectSheet` : la fiche
 * générique n'a pas d'emplacement pour la section « Profil contact » ni pour le badge Profils en tête.
 * Les briques sont les mêmes (bannière de signalement, liens, champs, fil d'activité) ; seule la
 * composition de la colonne centrale est propre à la personne.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const definition = getObject(TYPE);
  /* Les champs personnalisés d'abord : la fiche et ses briques les lisent comme des champs déclarés (2.4). */
  const customFields = await loadCustomFields();
  const [record, users, profile, companies, session] = await Promise.all([loadPerson(id), listUserOptions(), getContactProfile(id), listRecordOptions("company"), requireSession()]);
  /* Fiche absorbée par une fusion : son adresse mène à la fiche conservée (contrat 29). */
  if (record.id !== id) redirect(definition.href(record.id));
  /* Les options d'utilisateurs sont lues une fois pour la fiche, puis passées au fil : il ne les relit pas. */
  const feed = await listFeed(TYPE, id, users);
  const fields = fieldsOf(TYPE);
  const owner = fields.find((f) => f.key === "ownerId")!;
  const profiles = fields.find((f) => f.key === "profiles")!;
  /* Fiche archivée : elle se lit, elle ne s'écrit plus (D21) — champs en texte, composeur, créations rapides et profil contact retirés. */
  const archived = record.archivedAt != null;
  const isAdmin = session.user.role === "administrateur";
  return (
    <div className="grid gap-6">
      <CustomFieldsSource definitions={customFields} />
      <header className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{record.name as string}</h1>
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            <definition.icon aria-hidden />
            {definition.labels.singular}
          </Badge>
          <Badge variant="outline" className="border-border">{`Profils : ${displayValue(profiles, record.profiles, users)}`}</Badge>
          <ObjectActionsMenu type={TYPE} id={id} title={record.name as string} archived={archived} canDelete={isAdmin} />
        </div>
        <p className="tabular text-sm text-muted-foreground">{`Créée le ${formatDate(record.createdAt)} · modifiée le ${formatDate(record.updatedAt)} · responsable : ${displayValue(owner, record.ownerId, users)}`}</p>
      </header>
      <SheetBanners type={TYPE} id={id} showAction={isAdmin} />
      <SheetPanes
        feedCount={feed.items.length}
        links={<LinksColumn type={TYPE} id={id} readOnly={archived} />}
        main={
          <div className="grid min-w-0 content-start gap-6">
            <FieldsSection type={TYPE} record={serializeRecord(record)} users={users} readOnly={archived} />
            <ContactProfileSection personId={id} profile={profile} companies={companies} readOnly={archived} />
          </div>
        }
        feed={<ActivityFeed type={TYPE} id={id} items={feed.items} more={feed.more} users={users} currentUserId={session.user.id} readOnly={archived} />}
      />
    </div>
  );
}
