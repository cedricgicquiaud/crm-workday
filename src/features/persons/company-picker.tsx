"use client";

import { RelationSelect } from "@/features/objects/quick-create-dialog";

export type CompanyOption = { id: string; name: string };

type Props = {
  id: string;
  value: string | null;
  /** entreprises proposées : jamais une archivée (D21) ; l'entreprise courante s'y ajoute si elle ne s'y trouve plus */
  options: readonly CompanyOption[];
  current?: CompanyOption | null;
  error?: string;
  describedBy?: string;
  onChange: (companyId: string) => void;
};

/** Sélecteur d'entreprise de rattachement du profil contact (D3) : le sélecteur de relation des mécanismes, avec l'entreprise courante même archivée. */
export function CompanyPicker({ id, value, options, current, error, describedBy, onChange }: Props) {
  const items = current && !options.some((option) => option.id === current.id) ? [...options, { id: current.id, name: `${current.name} (archivée)` }] : options;
  return <RelationSelect id={id} label="Entreprise" value={value} options={items} placeholder="Choisir une entreprise…" error={error} describedBy={describedBy} onChange={onChange} />;
}
