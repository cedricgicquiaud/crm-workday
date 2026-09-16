"use client";

import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { duplicateMessage } from "@/features/duplicates/normalize";
import { getObject } from "@/features/objects/registry";

/**
 * Une fiche existante que le signal nomme ; même forme que celle rendue par l'API des doublons.
 * `href` et `message` : ceux d'un avertissement de saisie déclaré (D8), dont la fiche peut être d'un autre objet.
 */
export type DuplicateHint = { id: string; title: string; href?: string; message?: string };

const CREATE_ANYWAY = "Vous pouvez créer cette fiche quand même.";

/**
 * Avertissement « doublon probable » du dialogue de création (D19, contrat 28), ou « adresse déjà
 * connue » d'une source déclarée (D8) : il nomme la fiche existante et propose de l'ouvrir. **Il ne
 * refuse rien** — la phrase le dit en toutes lettres, et le bouton « Créer » reste actif : les refus
 * stricts (SIREN, adresse déjà portés) sont ailleurs. Le ton est celui d'un avertissement,
 * `role="status"` : le signal informe, il n'interrompt pas. `note` : la phrase de fin, « Vous pouvez
 * créer cette fiche quand même » par défaut, absente sous un champ de fiche où rien n'est à créer.
 * Mécanisme commun : il ne connaît que la clé d'objet du registre (D4).
 */
export function DuplicateWarning({ type, duplicates, note = CREATE_ANYWAY }: { type: string; duplicates: readonly DuplicateHint[]; note?: string | null }) {
  if (duplicates.length === 0) return null;
  const { href } = getObject(type);
  const [first] = duplicates;
  const twins = duplicates.filter((duplicate) => duplicate.message === undefined);
  return (
    <Alert role="status" className="border-l-[3px] border-l-warning bg-warning-subtle/40">
      <AlertDescription>
        <span>{first.message ?? duplicateMessage(twins.map((duplicate) => duplicate.title))}</span>
        <Link href={first.href ?? href(first.id)} className="font-medium underline underline-offset-2">
          Ouvrir la fiche
        </Link>
        {note && <span className="text-muted-foreground">{note}</span>}
      </AlertDescription>
    </Alert>
  );
}
