"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { ListValue } from "@/features/objects/registry";

type Props = {
  /** modules retenus par le consultant, dans l'ordre de la liste fermée */
  modules: readonly string[];
  certified: readonly string[];
  values: readonly ListValue[];
  /** modules retirés de la liste (D3) : lisibles sur la fiche qui les porte, jamais proposés */
  retired?: readonly ListValue[];
  error?: string;
  /** la fiche ne s'écrit plus (fiche archivée, D21) : les cases se lisent, elles ne se cochent plus */
  readOnly?: boolean;
  onChange: (next: { modules: string[]; certified: string[] }) => Promise<boolean>;
};

const CERTIFIED = "certifié";

/**
 * Modules Workday d'un consultant (D3, D9) : une case par module de la liste fermée, et pour chaque
 * module coché une seconde case « certifié ». Un module retiré de la liste reste lisible sur la fiche
 * qui le porte, marqué, et ne se coche plus.
 *
 * Chaque changement part au serveur et attend sa réponse : la case ne change d'état qu'une fois la
 * réponse reçue (l'appelant ne rend la nouvelle valeur qu'après un 2xx), un refus la remet comme elle
 * était et s'affiche sous la liste. Sur une fiche archivée, les cases sont inertes (`readOnly`), pas
 * éteintes : une case grisée serait illisible alors que c'est une donnée de la fiche.
 */
export function ModuleChecklist({ modules, certified, values, retired = [], error, readOnly = false, onChange }: Props) {
  const held = new Set(modules);
  const gone = retired.filter((entry) => held.has(entry.value));
  const shown = [...values.map((entry) => ({ ...entry, retired: false })), ...gone.map((entry) => ({ ...entry, retired: true }))];

  const toggleModule = (value: string) => {
    const next = held.has(value) ? modules.filter((entry) => entry !== value) : [...modules, value];
    return onChange({ modules: next, certified: certified.filter((entry) => next.includes(entry)) });
  };

  const toggleCertified = (value: string) => onChange({ modules: [...modules], certified: certified.includes(value) ? certified.filter((entry) => entry !== value) : [...certified, value] });

  return (
    <div className="grid gap-1">
      <span id="profil-consultant-modules-label" className="text-sm leading-none font-medium select-none">
        Modules
      </span>
      <ul aria-labelledby="profil-consultant-modules-label" className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {shown.map((entry) => {
          const checked = held.has(entry.value);
          const label = entry.retired ? `${entry.label} (retiré)` : entry.label;
          return (
            <li key={entry.value} className="flex min-w-0 items-center gap-2 text-sm">
              <Checkbox
                aria-label={label}
                checked={checked}
                /* Une valeur retirée ne se coche plus ; cochée, elle reste lisible et se décoche (D3). */
                disabled={entry.retired && !checked}
                /* Fiche archivée : la case est inerte, jamais éteinte — grisée, sa valeur ne se lirait plus. */
                readOnly={readOnly}
                onCheckedChange={() => !readOnly && void toggleModule(entry.value)}
              />
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
              {checked && (
                <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox aria-label={`${entry.label} ${CERTIFIED}`} checked={certified.includes(entry.value)} readOnly={readOnly} onCheckedChange={() => !readOnly && void toggleCertified(entry.value)} />
                  {CERTIFIED}
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
