"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
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

/** Ce que la liste porte, à comparer d'un rendu à l'autre : les modules retenus et ceux qui sont certifiés. */
type Held = { modules: string[]; certified: string[] };

const same = (a: Held, b: Held) => a.modules.join(",") === b.modules.join(",") && a.certified.join(",") === b.certified.join(",");

/**
 * Modules Workday d'un consultant (D3, D9) : une case par module de la liste fermée, et pour chaque
 * module coché une seconde case « certifié ». Un module retiré de la liste reste lisible sur la fiche
 * qui le porte, marqué, et ne se coche plus.
 *
 * La liste est un champ comme les autres, pas une suite de boutons : les cases se cochent à l'écran,
 * et un seul enregistrement part au geste de validation — quand le focus quitte la liste, ou sur
 * Entrée. L'historique écrit alors une ligne « Modules » et une ligne « Certifié sur » par geste
 * (D13, contrat 3), là où un envoi par clic en écrivait une par case cochée. Un refus remet les
 * cases comme elles étaient et s'affiche sous la liste. Sur une fiche archivée, les cases sont
 * inertes (`readOnly`), pas éteintes : une case grisée serait illisible alors que c'est une donnée
 * de la fiche.
 */
export function ModuleChecklist({ modules, certified, values, retired = [], error, readOnly = false, onChange }: Props) {
  const saved: Held = { modules: [...modules], certified: [...certified] };
  const [draft, setDraft] = useState<Held>(saved);
  /* La valeur enregistrée a changé ailleurs (réponse du serveur, rechargement) : le brouillon la suit. */
  const [seen, setSeen] = useState<Held>(saved);
  if (!same(seen, saved)) {
    setSeen(saved);
    setDraft(saved);
  }

  const held = new Set(draft.modules);
  const gone = retired.filter((entry) => held.has(entry.value));
  const shown = [...values.map((entry) => ({ ...entry, retired: false })), ...gone.map((entry) => ({ ...entry, retired: true }))];

  const toggleModule = (value: string) => {
    const next = held.has(value) ? draft.modules.filter((entry) => entry !== value) : [...draft.modules, value];
    setDraft({ modules: next, certified: draft.certified.filter((entry) => next.includes(entry)) });
  };

  const toggleCertified = (value: string) => setDraft({ modules: [...draft.modules], certified: draft.certified.includes(value) ? draft.certified.filter((entry) => entry !== value) : [...draft.certified, value] });

  /** Le geste est fini : ce qui a changé part en un seul enregistrement, et un refus remet les cases enregistrées. */
  async function commit() {
    if (same(draft, saved)) return;
    if (!(await onChange({ modules: [...draft.modules], certified: [...draft.certified] }))) setDraft(saved);
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
    <div className="grid gap-1" onBlur={readOnly ? undefined : onBlur} onKeyDown={readOnly ? undefined : onKeyDown}>
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
                onCheckedChange={() => !readOnly && toggleModule(entry.value)}
              />
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
              {checked && (
                <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox aria-label={`${entry.label} ${CERTIFIED}`} checked={draft.certified.includes(entry.value)} readOnly={readOnly} onCheckedChange={() => !readOnly && toggleCertified(entry.value)} />
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
