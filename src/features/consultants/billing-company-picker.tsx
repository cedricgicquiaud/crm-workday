"use client";

import { FieldControl } from "@/features/objects/field-control";
import { BILLING_COMPANY_TYPE } from "./schema";

export type BillingCompanyOption = { id: string; name: string };

type Props = {
  id: string;
  status: string;
  value: string | null;
  /** entreprises proposées : celles du type imposé par le statut, jamais une archivée (D4) */
  options: readonly BillingCompanyOption[];
  /** société enregistrée, même archivée depuis : elle reste affichée, marquée */
  current?: { id: string; name: string; archived: boolean } | null;
  error?: string;
  readOnly?: boolean;
  onChange: (companyId: string) => Promise<boolean>;
};

/** Valeur du choix « Aucune » : un sélecteur ne porte pas de valeur vide, et on doit pouvoir détacher la société. */
const NONE = "aucune";
const LABEL = "Société de facturation";

/**
 * Société de facturation d'un consultant (D4) : le sélecteur ne propose que le type que son statut
 * impose — la sienne pour un freelance, sa société de portage pour un porté. Un salarié n'en a pas :
 * le champ ne s'affiche pas du tout plutôt que de s'afficher vide et éteint.
 *
 * Une société archivée après avoir été choisie reste affichée, marquée : la fiche dit ce qu'elle
 * porte, elle ne l'oublie pas parce que l'entreprise a été archivée.
 */
export function BillingCompanyPicker({ id, status, value, options, current, error, readOnly = false, onChange }: Props) {
  if (BILLING_COMPANY_TYPE[status] == null) return null;
  const shown = current ? { id: current.id, name: current.archived ? `${current.name} (archivée)` : current.name } : null;
  if (readOnly) return <FieldControl id={id} label={LABEL} placement="sheet" kind="record" value={value ?? ""} display={shown?.name ?? "—"} readOnly />;
  const items = shown && !options.some((option) => option.id === shown.id) ? [...options, shown] : options;
  return (
    <FieldControl
      id={id}
      label={LABEL}
      placement="sheet"
      kind="list"
      value={value ?? NONE}
      /* La première entrée retire la société : sans elle, on ne pourrait plus la détacher pour changer de statut (D4). */
      options={[{ value: NONE, label: "Aucune" }, ...items.map((option) => ({ value: option.id, label: option.name }))]}
      placeholder="Choisir une entreprise…"
      error={error}
      onSave={(next) => onChange(next === NONE ? "" : next)}
    />
  );
}
