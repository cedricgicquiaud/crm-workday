"use client";

import { useCallback, useEffect, useState } from "react";
import "@/features/objects/manifest";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { MergePlan } from "@/features/merge/merge";
import { getObject } from "@/features/objects/registry";

/** `other` : la fiche jumelle désignée par le lien de la bannière ; sans elle, la première jumelle trouvée. */
type Props = { type: string; id: string; title: string; other: string | null; open: boolean; onOpenChange: (open: boolean) => void };

type Candidate = { id: string; title: string };

const FAILED = "La fusion n'a pas pu être menée.";

/** Une des deux fiches ; l'écran ne manipule jamais autre chose que « celle-ci » et « l'autre ». */
type Side = "this" | "other";

/**
 * Fusion de deux fiches (D20, contrats 29 et 31), réservée à un administrateur. Le dialogue demande
 * les trois choses qu'un geste irréversible doit demander avant d'écrire : **quelle fiche reste**,
 * **quelle valeur garder** pour chaque champ que les deux fiches ne remplissent pas pareil, et
 * **ce qui sera déplacé**, compté famille par famille. Rien n'est écrit avant « Fusionner », et
 * aucun échec n'est avalé : un refus du serveur s'affiche dans le dialogue, la fiche reste intacte.
 */
export function MergeDialog({ type, id, title, other, open, onOpenChange }: Props) {
  const definition = getObject(type);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [otherId, setOtherId] = useState<string | null>(other);
  const [keep, setKeep] = useState<Side>("this");
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [taken, setTaken] = useState<Record<string, Side>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback((message?: string) => setFailure(message ?? FAILED), []);

  /* Les fiches jumelles à l'ouverture : celle du lien reste choisie, sinon la première proposée. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/objets/${encodeURIComponent(type)}/doublons?fiche=${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ duplicates: Candidate[] }>) : Promise.reject(new Error(FAILED))))
      .then(({ duplicates }) => {
        if (cancelled) return;
        setCandidates(duplicates);
        setOtherId((current) => (current && duplicates.some((d) => d.id === current) ? current : duplicates[0]?.id ?? null));
      })
      .catch(() => !cancelled && fail("Les doublons de cette fiche n'ont pas pu être lus."));
    return () => {
      cancelled = true;
    };
  }, [open, type, id, fail]);

  const keptId = keep === "this" ? id : otherId;
  const absorbedId = keep === "this" ? otherId : id;

  /* Ce que la fusion déplacerait, relu à chaque changement de la paire : le compte annoncé est celui du geste qui suivra. */
  useEffect(() => {
    if (!open || !keptId || !absorbedId) return;
    let cancelled = false;
    fetch(`/api/objets/${encodeURIComponent(type)}/fusion?keptId=${encodeURIComponent(keptId)}&absorbedId=${encodeURIComponent(absorbedId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<MergePlan>) : Promise.reject(new Error(FAILED))))
      .then((next) => {
        if (cancelled) return;
        /* Les choix champ par champ repartent de zéro : ils parlaient de l'autre paire. */
        setTaken({});
        setPlan(next);
      })
      .catch(() => !cancelled && fail("L'aperçu de la fusion n'a pas pu être lu."));
    return () => {
      cancelled = true;
    };
  }, [open, type, keptId, absorbedId, fail]);

  function change(next: boolean) {
    /* Rouvrir le dialogue repart d'un écran propre : le refus précédent ne parle plus de l'état courant. */
    if (!next) {
      setFailure(null);
      setCandidates(null);
      setPlan(null);
      setKeep("this");
    }
    onOpenChange(next);
  }

  async function confirm() {
    if (!keptId || !absorbedId) return;
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(`/api/objets/${encodeURIComponent(type)}/fusion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keptId, absorbedId, take: Object.entries(taken).filter(([, side]) => side === "other").map(([key]) => key) }),
      });
    } catch {
      setBusy(false);
      return fail();
    }
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res.ok) return fail(body?.message);
    /*
     * L'écran ne suit la fusion qu'une fois la réponse reçue. La fiche conservée se recharge depuis
     * le serveur plutôt que par `router.refresh()` : la colonne des champs garde sa propre copie de
     * la fiche, et un rafraîchissement laisserait les anciennes valeurs dans les cases de saisie.
     */
    window.location.assign(definition.href(keptId));
  }

  const otherTitle = candidates?.find((candidate) => candidate.id === otherId)?.title ?? "";
  const nothingToMerge = candidates !== null && candidates.length === 0;

  return (
    <Dialog open={open} onOpenChange={change}>
      {/* Seuls les champs à trancher défilent : le compte de ce qui sera déplacé et les deux boutons
          restent sous les yeux, sinon on confirmerait un geste irréversible sans avoir vu son prix. */}
      <DialogContent className="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>Fusionner deux fiches</DialogTitle>
          <DialogDescription>
            {`La fiche absorbée disparaît, tout ce qu'elle porte rejoint la fiche conservée et son adresse y mène : le geste est irréversible.`}
          </DialogDescription>
        </DialogHeader>

        {nothingToMerge && <p className="text-sm text-muted-foreground">{`Aucun doublon probable pour cette ${definition.labels.singular.toLowerCase()}.`}</p>}

        {otherId && (
          <>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto">
              <Choice label="Fiche conservée" value={keep} options={[{ value: "this" as Side, label: title }, { value: "other" as Side, label: otherTitle }]} onChange={setKeep} />
              {plan?.fields.map((field) => (
                <Choice
                  key={field.key}
                  label={field.label}
                  value={taken[field.key] ?? "this"}
                  options={[{ value: "this" as Side, label: field.kept }, { value: "other" as Side, label: field.absorbed }]}
                  onChange={(side) => setTaken((current) => ({ ...current, [field.key]: side }))}
                />
              ))}
            </div>
            <Moved fields={plan?.moved ?? []} />
          </>
        )}

        {failure && (
          <p role="alert" className="rounded-md border-l-[3px] border-l-danger bg-danger-subtle/40 p-2 text-sm">
            {failure}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => change(false)}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={busy || !otherId} onClick={() => void confirm()}>
            Fusionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ce qui rejoindra la fiche conservée, famille par famille : le compte est celui du geste qui suivra (contrat 29). */
function Moved({ fields }: { fields: MergePlan["moved"] }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium">Ce qui sera déplacé</p>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">{`Rien n'est rattaché à la fiche absorbée.`}</p>
      ) : (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {fields.map((family) => (
            <li key={family.key} className="tabular">{`${family.label} : ${family.count}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Un choix entre deux valeurs, en boutons radio : le libellé nomme le groupe, chaque bouton porte
 * la valeur qu'il garde. Le nom accessible est posé sur le bouton lui-même — un `label` autour ne
 * nomme pas un bouton, seulement un champ de formulaire.
 */
function Choice({ label, value, options, onChange }: { label: string; value: Side; options: { value: Side; label: string }[]; onChange: (value: Side) => void }) {
  return (
    <div className="grid min-w-0 gap-2">
      <p className="text-xs font-medium">{label}</p>
      <RadioGroup aria-label={label} value={value} onValueChange={(next) => onChange(next as Side)} className="grid gap-2">
        {options.map((option) => (
          <span key={option.value} className="flex min-w-0 items-center gap-2">
            <RadioGroupItem value={option.value} aria-label={option.label} />
            <span className="min-w-0 truncate text-sm" title={option.label}>
              {option.label}
            </span>
          </span>
        ))}
      </RadioGroup>
    </div>
  );
}
