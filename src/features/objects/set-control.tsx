"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ListValue } from "@/features/objects/registry";

type Props = {
  /** identifiant du contrôle ; le libellé porte `<id>-label` et le refus `<id>-error` */
  id: string;
  label: string;
  /** valeurs enregistrées */
  value: readonly string[];
  /** valeurs de la liste fermée, dans leur ordre */
  values: readonly ListValue[];
  /** valeurs retirées de la liste : lisibles sur la fiche qui les porte, jamais proposées */
  retired?: readonly ListValue[];
  /** refus du serveur, affiché sous la liste */
  error?: string;
  /** enregistre l'ensemble ; faux remet les cases enregistrées */
  onSave: (next: string[]) => Promise<boolean>;
};

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((entry) => b.includes(entry));

/**
 * Plusieurs valeurs d'une liste fermée (D63) : une case par valeur. Les cases se cochent à l'écran et
 * un seul enregistrement part au geste de validation — quand le focus quitte la liste, ou sur Entrée —
 * pour que l'historique écrive une ligne par geste, pas une par case. Un refus s'affiche sous la liste
 * et remet les cases comme elles étaient enregistrées. Une valeur retirée de la liste reste lisible,
 * marquée, sur la fiche qui la porte : décochée, elle ne se recoche plus.
 */
export function SetControl({ id, label, value, values, retired = [], error, onSave }: Props) {
  const [draft, setDraft] = useState<string[]>([...value]);
  /* La valeur enregistrée a changé ailleurs (réponse du serveur, rechargement) : le brouillon la suit. */
  const [seen, setSeen] = useState<readonly string[]>(value);
  if (!same(seen, value)) {
    setSeen(value);
    setDraft([...value]);
  }

  const held = new Set(draft);
  const kept = retired.filter((entry) => value.includes(entry.value));
  const shown = [...values.map((entry) => ({ ...entry, retired: false })), ...kept.map((entry) => ({ ...entry, retired: true }))];
  const errorId = `${id}-error`;

  const toggle = (entry: string) => setDraft(held.has(entry) ? draft.filter((current) => current !== entry) : [...draft, entry]);

  async function commit() {
    if (same(draft, value)) return;
    if (!(await onSave([...draft]))) setDraft([...value]);
  }

  /* Le focus quitte la liste (champ suivant, clic ailleurs) : c'est la validation du geste. */
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) void commit();
  };

  /* Entrée valide sans quitter la liste ; la case, elle, ne se coche qu'à l'Espace ou au clic. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void commit();
  };

  return (
    <div className="grid gap-1" onBlur={onBlur} onKeyDown={onKeyDown}>
      <span id={`${id}-label`} className="text-sm leading-none font-medium select-none">
        {label}
      </span>
      <ul role="group" id={id} aria-labelledby={`${id}-label`} aria-describedby={error ? errorId : undefined} className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {shown.map((entry) => {
          const checked = held.has(entry.value);
          const text = entry.retired ? `${entry.label} (retirée)` : entry.label;
          return (
            <li key={entry.value} className="flex min-w-0 items-center gap-2 text-sm">
              {/* Une valeur retirée ne se coche plus ; cochée, elle reste lisible et se décoche. */}
              <Checkbox aria-label={text} checked={checked} disabled={entry.retired && !checked} onCheckedChange={() => toggle(entry.value)} />
              <span className="min-w-0 truncate" title={text}>
                {text}
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
