"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

/** Sélecteur d'entreprise de rattachement (D3) : les entreprises actives, la dernière modifiée en tête. */
export function CompanyPicker({ id, value, options, current, error, describedBy, onChange }: Props) {
  const items = current && !options.some((option) => option.id === current.id) ? [...options, { id: current.id, name: `${current.name} (archivée)` }] : options;
  return (
    <Select items={items.map((option) => ({ value: option.id, label: option.name }))} value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger id={id} aria-label="Entreprise" size="sm" aria-invalid={error ? true : undefined} aria-describedby={describedBy} className="w-full">
        <SelectValue placeholder="Choisir une entreprise…" />
      </SelectTrigger>
      <SelectContent>
        {items.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
