"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldControl } from "@/features/objects/field-control";
import { CompanyPicker, type CompanyOption } from "@/features/persons/company-picker";
import type { ContactProfile } from "@/features/persons/contact-profile";
import { DECISION_ROLES } from "@/features/persons/schema";

/** `readOnly` : la personne ne s'écrit plus (fiche archivée, D21) ; le profil se lit, il ne se pose ni ne se change. */
type Props = { personId: string; profile: ContactProfile | null; companies: readonly CompanyOption[]; readOnly?: boolean };

type Failure = { message?: string; fields?: Record<string, string> };

const FAILED = "La modification n'a pas pu être enregistrée.";

/**
 * Section « Profil contact » de la fiche personne (D3) : sans profil, un bouton « Ajouter un profil
 * contact » ouvre le choix de l'entreprise (obligatoire) ; avec profil, l'entreprise et le rôle
 * s'éditent en place (le poste, champ déclaré de la personne, s'édite dans « Champs »). Les deux
 * passent par le champ des mécanismes : la valeur affichée ne change qu'après la réponse 2xx, un
 * refus s'affiche en alerte sous le champ et la valeur enregistrée revient. Le sélecteur ne propose
 * que des entreprises actives.
 */
export function ContactProfileSection({ personId, profile: initial, companies, readOnly = false }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Enregistre un changement du profil (création au premier choix d'entreprise) ; rend vrai si accepté. */
  async function save(field: string, value: string): Promise<boolean> {
    const fail = (message: string) => {
      setErrors((current) => ({ ...current, [field]: message }));
      return false;
    };
    let res: Response;
    try {
      res = await fetch(`/api/personnes/${encodeURIComponent(personId)}/profil-contact`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    } catch {
      return fail(FAILED);
    }
    const body = (await res.json().catch(() => null)) as (ContactProfile & Failure) | null;
    if (!res.ok) return fail(body?.fields?.[field] ?? body?.message ?? FAILED);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)));
    if (body) setProfile(body);
    setAdding(false);
    router.refresh();
    return true;
  }

  const companyField = (
    <CompanyPicker
      id="profil-contact-companyId"
      value={profile?.companyId ?? null}
      options={companies}
      current={profile ? { id: profile.companyId, name: profile.companyName } : null}
      error={errors.companyId}
      onChange={(companyId) => save("companyId", companyId)}
    />
  );

  return (
    <section aria-label="Profil contact" className="grid gap-3">
      <h2 className="text-base font-medium">Profil contact</h2>
      {!profile && !adding && (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-muted-foreground">Cette personne n&apos;a pas de profil contact.</p>
          {/* Fiche archivée : le bouton disparaît plutôt que de s'éteindre — le rattachement finirait en 409. */}
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              Ajouter un profil contact
            </Button>
          )}
        </div>
      )}
      {!profile && adding && (
        <div className="grid gap-3">
          {companyField}
          <p className="text-xs text-muted-foreground">Choisir l&apos;entreprise crée le profil ; le rôle se règle ensuite, le poste dans « Champs ».</p>
        </div>
      )}
      {profile && (
        <div className="grid gap-3">
          {/* Fiche archivée : l'entreprise et le rôle se lisent en texte, ils ne se changent plus (D21). */}
          {readOnly ? <FieldControl id="profil-contact-companyId" label="Entreprise" placement="sheet" kind="record" value={profile.companyId} display={profile.companyName} readOnly /> : companyField}
          <FieldControl
            id="profil-contact-decisionRole"
            label="Rôle dans la décision"
            placement="sheet"
            kind="list"
            value={profile.decisionRole}
            options={DECISION_ROLES.map((role) => ({ value: role.value, label: role.label }))}
            display={roleLabel(profile.decisionRole)}
            error={errors.decisionRole}
            readOnly={readOnly}
            onSave={(next) => save("decisionRole", next)}
          />
        </div>
      )}
    </section>
  );
}

const roleLabel = (value: string) => DECISION_ROLES.find((role) => role.value === value)?.label ?? value;
