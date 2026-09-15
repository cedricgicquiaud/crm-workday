"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldControl } from "@/features/objects/field-control";
import { displayValue } from "@/features/objects/labels";
import type { FieldDescriptor } from "@/features/objects/registry";
import { BillingCompanyPicker, type BillingCompanyOption } from "./billing-company-picker";
import type { ConsultantProfile } from "./consultant-profile";
import { ModuleChecklist } from "./module-checklist";
import { CONSULTANT_PROFILE_FIELDS, MODULES, RETIRED_MODULES, STATUSES } from "./schema";

/** `readOnly` : la personne ne s'écrit plus (fiche archivée, D21) ; le profil se lit, il ne se pose ni ne se change. */
type Props = { personId: string; profile: ConsultantProfile | null; companies: readonly BillingCompanyOption[]; readOnly?: boolean };

type Failure = { message?: string; fields?: Record<string, string> };

const FAILED = "La modification n'a pas pu être enregistrée.";

const field = (key: string): FieldDescriptor => CONSULTANT_PROFILE_FIELDS.find((entry) => entry.key === key)!;

const id = (key: string) => `profil-consultant-${key}`;

/** Ce qu'un champ rend en lecture : le libellé d'une liste, un montant avec son unité, une date courte. */
const shown = (key: string, value: unknown) => displayValue(field(key), value, []);

/**
 * Section « Profil consultant » de la fiche personne (D9), sous « Profil contact ». Sans profil, un
 * bouton « Ajouter un profil consultant » demande le statut, et le choix du statut crée le profil ;
 * avec profil, chaque champ s'édite en place. La valeur affichée ne change qu'après la réponse 2xx du
 * serveur : un refus s'affiche sous le champ et la valeur enregistrée reprend sa place.
 *
 * Les champs du profil ne se montrent qu'ici, jamais dans « Champs » (D19) : c'est le registre qui
 * les en exclut, pas cette section. Sur une fiche archivée, tout se lit et rien ne s'écrit.
 */
export function ConsultantProfileSection({ personId, profile: initial, companies, readOnly = false }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Enregistre un changement du profil (création au premier statut) ; rend vrai si le serveur l'a accepté. */
  async function save(patch: Record<string, unknown>, shownOn = Object.keys(patch)[0]): Promise<boolean> {
    const fail = (message: string) => {
      setErrors((current) => ({ ...current, [shownOn]: message }));
      return false;
    };
    let res: Response;
    try {
      res = await fetch(`/api/personnes/${encodeURIComponent(personId)}/profil-consultant`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    } catch {
      return fail(FAILED);
    }
    const body = (await res.json().catch(() => null)) as (ConsultantProfile & Failure) | null;
    if (!res.ok) return fail(body?.fields?.[shownOn] ?? Object.values(body?.fields ?? {})[0] ?? body?.message ?? FAILED);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== shownOn)));
    if (body) setProfile(body);
    setAdding(false);
    router.refresh();
    return true;
  }

  const one = (key: string, value: string | number | null) => save({ [key]: value }, key);

  /** Un nombre saisi à la française part en nombre ; un champ vidé part en « rien ». */
  const asNumber = (value: string) => {
    const text = value.trim().replace(",", ".");
    return text === "" ? null : Number(text);
  };

  const statusPicker = (
    <FieldControl
      id={id("status")}
      label="Statut"
      placement="sheet"
      kind="list"
      value={profile?.status ?? ""}
      options={STATUSES.map((entry) => ({ value: entry.value, label: entry.label }))}
      placeholder="Choisir un statut…"
      display={shown("status", profile?.status)}
      error={errors.status}
      onSave={(next) => one("status", next)}
    />
  );

  return (
    <section aria-label="Profil consultant" className="grid gap-3">
      <h2 className="text-base font-medium">Profil consultant</h2>

      {!profile && !adding && (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-muted-foreground">Cette personne n&apos;a pas de profil consultant.</p>
          {/* Fiche archivée : le bouton disparaît plutôt que de s'éteindre — la création finirait en 409. */}
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              Ajouter un profil consultant
            </Button>
          )}
        </div>
      )}

      {!profile && adding && (
        <div className="grid gap-3">
          {statusPicker}
          <p className="text-xs text-muted-foreground">Choisir le statut crée le profil ; les autres champs se remplissent ensuite.</p>
        </div>
      )}

      {profile && (
        <div className="grid gap-3">
          {readOnly ? <FieldControl id={id("status")} label="Statut" placement="sheet" kind="list" value={profile.status} display={shown("status", profile.status)} readOnly /> : statusPicker}

          <ModuleChecklist
            modules={profile.modules}
            certified={profile.certifiedModules}
            values={MODULES}
            retired={RETIRED_MODULES}
            error={errors.modules ?? errors.certifiedModules}
            readOnly={readOnly}
            onChange={(next) => save({ modules: next.modules, certifiedModules: next.certified }, "modules")}
          />

          <BillingCompanyPicker
            id={id("billingCompanyId")}
            status={profile.status}
            value={profile.billingCompanyId}
            options={companies}
            current={profile.billingCompanyId && profile.billingCompanyName ? { id: profile.billingCompanyId, name: profile.billingCompanyName, archived: profile.billingCompanyArchived } : null}
            error={errors.billingCompanyId}
            readOnly={readOnly}
            onChange={(next) => one("billingCompanyId", next)}
          />

          <FieldControl
            id={id("dailyCost")}
            label="Coût journalier"
            placement="sheet"
            kind="number"
            value={profile.dailyCost === null ? "" : String(profile.dailyCost)}
            display={shown("dailyCost", profile.dailyCost)}
            error={errors.dailyCost}
            readOnly={readOnly}
            onSave={(next) => one("dailyCost", asNumber(next))}
          />

          <FieldControl
            id={id("availableFrom")}
            label="Disponible à partir du"
            placement="sheet"
            kind="date"
            value={profile.availableFrom ?? ""}
            display={shown("availableFrom", profile.availableFrom)}
            error={errors.availableFrom}
            readOnly={readOnly}
            onSave={(next) => one("availableFrom", next === "" ? null : next)}
          />

          <div className="grid gap-1">
            <label className="flex w-fit items-center gap-2 text-sm leading-none font-medium">
              {/* Case inerte sur une fiche archivée (`readOnly`) : éteinte, sa valeur ne se lirait plus. */}
              <Checkbox aria-label="Indisponible" checked={profile.unavailable === "oui"} disabled={readOnly} readOnly={readOnly} onCheckedChange={(checked) => !readOnly && void one("unavailable", checked ? "oui" : "non")} />
              Indisponible
            </label>
            {errors.unavailable && (
              <p role="alert" className="text-xs text-danger">
                {errors.unavailable}
              </p>
            )}
          </div>

          {/* Le motif ne se saisit que sous la case : sans elle, le serveur le refuse (D6). */}
          {profile.unavailable === "oui" && (
            <FieldControl
              id={id("unavailableReason")}
              label="Motif d'indisponibilité"
              placement="sheet"
              kind="text"
              value={profile.unavailableReason ?? ""}
              error={errors.unavailableReason}
              readOnly={readOnly}
              onSave={(next) => one("unavailableReason", next === "" ? null : next)}
            />
          )}

          <FieldControl
            id={id("yearsExperience")}
            label="Années d'expérience"
            placement="sheet"
            kind="number"
            value={profile.yearsExperience === null ? "" : String(profile.yearsExperience)}
            display={shown("yearsExperience", profile.yearsExperience)}
            error={errors.yearsExperience}
            readOnly={readOnly}
            onSave={(next) => one("yearsExperience", asNumber(next))}
          />

          <FieldControl id={id("languages")} label="Langues" placement="sheet" kind="text" value={profile.languages ?? ""} error={errors.languages} readOnly={readOnly} onSave={(next) => one("languages", next === "" ? null : next)} />

          <FieldControl id={id("cvUrl")} label="CV" placement="sheet" kind="text" value={profile.cvUrl ?? ""} error={errors.cvUrl} readOnly={readOnly} onSave={(next) => one("cvUrl", next === "" ? null : next)} />
        </div>
      )}
    </section>
  );
}
