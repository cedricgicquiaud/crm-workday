"use client";

import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { duplicateMessage } from "@/features/duplicates/normalize";
import { getObject } from "@/features/objects/registry";

/** Une fiche existante que le signal nomme ; même forme que celle rendue par l'API des doublons. */
export type DuplicateHint = { id: string; title: string };

/**
 * Avertissement « doublon probable » du dialogue de création (D19, contrat 28) : il nomme la fiche
 * existante et propose de l'ouvrir. **Il ne refuse rien** — la phrase le dit en toutes lettres, et
 * le bouton « Créer » reste actif : les refus stricts (SIREN, adresse déjà portés) sont ailleurs.
 * Le ton est celui d'un avertissement, `role="status"` : le signal informe, il n'interrompt pas.
 * Mécanisme commun : il ne connaît que la clé d'objet du registre (D4).
 */
export function DuplicateWarning({ type, duplicates }: { type: string; duplicates: readonly DuplicateHint[] }) {
  if (duplicates.length === 0) return null;
  const { href } = getObject(type);
  return (
    <Alert role="status" className="border-l-[3px] border-l-warning bg-warning-subtle/40">
      <AlertDescription>
        <span>{duplicateMessage(duplicates.map((duplicate) => duplicate.title))}</span>
        <Link href={href(duplicates[0].id)} className="font-medium underline underline-offset-2">
          Ouvrir la fiche
        </Link>
        <span className="text-muted-foreground">Vous pouvez créer cette fiche quand même.</span>
      </AlertDescription>
    </Alert>
  );
}
