import { notFound } from "next/navigation";
import "@/features/objects/manifest.server";
import { Badge } from "@/components/ui/badge";
import { HistoryList } from "@/features/history/history-list";
import { fieldsOf } from "@/features/objects/fields";
import { FieldsSection } from "@/features/objects/fields-section";
import { displayValue, formatDate } from "@/features/objects/labels";
import { LinksColumn } from "@/features/objects/links-column";
import { getObject } from "@/features/objects/registry";
import { listRecordOptions, listUserOptions, serializeRecord } from "@/features/objects/service";
import { getContactProfile } from "@/features/persons/contact-profile";
import { ContactProfileSection } from "@/features/persons/contact-profile-section";
import { getPerson, type PersonRecord } from "@/features/persons/persons";
import { HttpError } from "@/lib/auth/session";

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
 * Les briques sont les mêmes (liens, champs, historique) ; seule la composition est propre à la personne.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const definition = getObject(TYPE);
  const [record, users, profile, companies] = await Promise.all([loadPerson(id), listUserOptions(), getContactProfile(id), listRecordOptions("company")]);
  const fields = fieldsOf(TYPE);
  const owner = fields.find((f) => f.key === "ownerId")!;
  const profiles = fields.find((f) => f.key === "profiles")!;
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{record.name as string}</h1>
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            <definition.icon aria-hidden />
            {definition.labels.singular}
          </Badge>
          <Badge variant="outline" className="border-border">{`Profils : ${displayValue(profiles, record.profiles, users)}`}</Badge>
        </div>
        <p className="tabular text-sm text-muted-foreground">{`Créée le ${formatDate(record.createdAt)} · modifiée le ${formatDate(record.updatedAt)} · responsable : ${displayValue(owner, record.ownerId, users)}`}</p>
      </header>
      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_var(--pane-right-w)] xl:grid-cols-[var(--pane-left-w)_minmax(0,1fr)_var(--pane-right-w)]">
        <LinksColumn type={TYPE} id={id} className="min-[900px]:hidden xl:block" />
        <div className="grid min-w-0 content-start gap-6">
          <FieldsSection type={TYPE} record={serializeRecord(record)} users={users} />
          <ContactProfileSection personId={id} profile={profile} companies={companies} />
        </div>
        <section aria-label="Historique" className="grid min-w-0 content-start gap-3">
          <h2 className="text-base font-medium">Historique</h2>
          <HistoryList type={TYPE} id={id} users={users} />
        </section>
      </div>
    </div>
  );
}
