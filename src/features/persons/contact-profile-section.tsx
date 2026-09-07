"use client";

import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContactProfile } from "@/features/persons/contact-profile";
import { CompanyPicker, type CompanyOption } from "@/features/persons/company-picker";
import { DECISION_ROLES } from "@/features/persons/schema";

type Props = { personId: string; profile: ContactProfile | null; companies: readonly CompanyOption[] };

type Failure = { message?: string; fields?: Record<string, string> };

const FAILED = "La modification n'a pas pu être enregistrée.";

/**
 * Section « Profil contact » de la fiche personne (D3) : sans profil, un bouton « Ajouter un profil
 * contact » ouvre le choix de l'entreprise (obligatoire) ; avec profil, l'entreprise, le poste et le
 * rôle s'éditent en place. La valeur affichée ne change qu'après la réponse 2xx ; un refus s'affiche
 * sous le champ (`role="alert"`) et la valeur enregistrée revient. Le sélecteur ne propose que des
 * entreprises actives.
 */
export function ContactProfileSection({ personId, profile: initial, companies }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");

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
    if (body) {
      setProfile(body);
      setJobTitle(body.jobTitle ?? "");
    }
    setAdding(false);
    router.refresh();
    return true;
  }

  async function commitJobTitle() {
    const value = jobTitle.trim();
    if (value === (profile?.jobTitle ?? "")) return;
    if (!(await save("jobTitle", value))) setJobTitle(profile?.jobTitle ?? "");
  }

  function onJobTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setJobTitle(profile?.jobTitle ?? "");
      event.currentTarget.blur();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
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
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            Ajouter un profil contact
          </Button>
        </div>
      )}
      {!profile && adding && (
        <div className="grid gap-3">
          {companyField}
          <p className="text-xs text-muted-foreground">Choisir l&apos;entreprise crée le profil ; le poste et le rôle se règlent ensuite.</p>
        </div>
      )}
      {profile && (
        <div className="grid gap-3">
          {companyField}
          <Field id="profil-contact-jobTitle" label="Poste" error={errors.jobTitle}>
            <Input id="profil-contact-jobTitle" className="h-7 truncate" value={jobTitle} title={jobTitle || undefined} aria-invalid={errors.jobTitle ? true : undefined} aria-describedby={errors.jobTitle ? "profil-contact-jobTitle-error" : undefined} onChange={(e) => setJobTitle(e.target.value)} onBlur={() => void commitJobTitle()} onKeyDown={onJobTitleKeyDown} />
          </Field>
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
