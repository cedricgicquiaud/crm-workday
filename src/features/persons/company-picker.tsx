"use client";

import { FieldControl } from "@/features/objects/field-control";

export type CompanyOption = { id: string; name: string };

type Props = {
  id: string;
  value: string | null;
  /** entreprises proposées : jamais une archivée (D21) ; l'entreprise courante s'y ajoute si elle ne s'y trouve plus */
  options: readonly CompanyOption[];
  current?: CompanyOption | null;
  error?: string;
  onChange: (companyId: string) => Promise<boolean>;
};

/** Sélecteur d'entreprise de rattachement du profil contact (D3) : le champ de fiche liée des mécanismes, avec l'entreprise courante même archivée. */
export function CompanyPicker({ id, value, options, current, error, onChange }: Props) {
  const items = current && !options.some((option) => option.id === current.id) ? [...options, { id: current.id, name: `${current.name} (archivée)` }] : options;
  return (
    <FieldControl
      id={id}
      label="Entreprise"
      placement="sheet"
      kind="record"
      value={value ?? ""}
      options={items.map((option) => ({ value: option.id, label: option.name }))}
      placeholder="Choisir une entreprise…"
      error={error}
      onSave={onChange}
    />
  );
}
