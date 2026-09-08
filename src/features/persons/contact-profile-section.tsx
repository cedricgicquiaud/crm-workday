"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContactProfile } from "@/features/persons/contact-profile";
import { CompanyPicker, type CompanyOption } from "@/features/persons/company-picker";
import { DECISION_ROLES } from "@/features/persons/schema";

/** `readOnly` : la personne ne s'écrit plus (fiche archivée, D21) ; le profil se lit, il ne se pose ni ne se change. */
type Props = { personId: string; profile: ContactProfile | null; companies: readonly CompanyOption[]; readOnly?: boolean };

type Failure = { message?: string; fields?: Record<string, string> };

const FAILED = "La modification n'a pas pu être enregistrée.";

/**
 * Section « Profil contact » de la fiche personne (D3) : sans profil, un bouton « Ajouter un profil
 * contact » ouvre le choix de l'entreprise (obligatoire) ; avec profil, l'entreprise et le rôle
 * s'éditent en place (le poste, champ déclaré de la personne, s'édite dans « Champs »). La valeur
 * affichée ne change qu'après la réponse 2xx ; un refus s'affiche sous le champ (`role="alert"`) et
 * la valeur enregistrée revient. Le sélecteur ne propose que des entreprises actives.
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

  const companyError = errors.companyId;
  const companyField = (
    <Field id="profil-contact-companyId" label="Entreprise" error={companyError}>
      <CompanyPicker id="profil-contact-companyId" value={profile?.companyId ?? null} options={companies} current={profile ? { id: profile.companyId, name: profile.companyName } : null} error={companyError} describedBy={companyError ? "profil-contact-companyId-error" : undefined} onChange={(companyId) => void save("companyId", companyId)} />
    </Field>
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
      {profile && readOnly && (
        <div className="grid gap-3">
          <ReadOnlyField id="profil-contact-companyId" label="Entreprise" value={profile.companyName} />
          <ReadOnlyField id="profil-contact-decisionRole" label="Rôle dans la décision" value={DECISION_ROLES.find((role) => role.value === profile.decisionRole)?.label ?? profile.decisionRole} />
        </div>
      )}
      {profile && !readOnly && (
        <div className="grid gap-3">
          {companyField}
          <Field id="profil-contact-decisionRole" label="Rôle dans la décision" error={errors.decisionRole}>
            <Select items={DECISION_ROLES.map((role) => ({ value: role.value, label: role.label }))} value={profile.decisionRole} onValueChange={(next) => next && void save("decisionRole", next)}>
              <SelectTrigger id="profil-contact-decisionRole" aria-label="Rôle dans la décision" size="sm" aria-invalid={errors.decisionRole ? true : undefined} aria-describedby={errors.decisionRole ? "profil-contact-decisionRole-error" : undefined} className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {DECISION_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
    </section>
  );
}

/**
 * Champ du profil sur une fiche archivée : la valeur se lit comme du texte, jamais par un contrôle
 * éteint — celui-ci serait à demi transparent alors que c'est une donnée de la fiche (D21).
 */
function ReadOnlyField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span id={`${id}-label`} className="flex items-center gap-2 text-sm leading-none font-medium select-none">
        {label}
      </span>
      <p id={id} aria-labelledby={`${id}-label`} className="min-w-0 truncate text-sm" title={value}>
        {value}
      </p>
    </div>
  );
}

/** Libellé au-dessus (12 px / 500), erreur en dessous (11 px), comme les champs de la fiche. */
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
