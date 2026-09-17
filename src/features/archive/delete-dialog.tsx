"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import "@/features/objects/manifest";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DeleteBlocker } from "@/features/archive/delete";
import { getObject } from "@/features/objects/registry";

type Props = { type: string; id: string; open: boolean; onOpenChange: (open: boolean) => void };

const FAILED = "La suppression n'a pas pu être menée.";

/** Refus du serveur : le message, et la liste de ce qui retient la fiche (409). */
type Failure = { message?: string; blockers?: DeleteBlocker[] };

/**
 * Confirmation de la suppression définitive (contrat 31), réservée à un administrateur : la fiche
 * et son historique disparaissent, le geste est irréversible. Quand la fiche est retenue, le refus
 * du serveur (409) ne se résume pas à « impossible » : il nomme ce qui la retient, ligne par ligne,
 * pour que l'administrateur sache quoi défaire. Aucun échec n'est avalé.
 */
export function DeleteDialog({ type, id, open, onOpenChange }: Props) {
  const router = useRouter();
  const { labels, listHref } = getObject(type);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(`/api/objets/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      setFailure({ message: FAILED });
      setBusy(false);
      return;
    }
    const body = (await res.json().catch(() => null)) as Failure | null;
    setBusy(false);
    if (!res.ok) {
      setFailure({ message: body?.message ?? FAILED, blockers: body?.blockers });
      return;
    }
    /* La fiche n'existe plus : rester dessus afficherait un 404. */
    router.push(listHref);
    router.refresh();
  }

  /* Rouvrir le dialogue repart d'un écran propre : le refus précédent ne parle plus de l'état courant. */
  function change(next: boolean) {
    if (!next) setFailure(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer définitivement ?</DialogTitle>
          <DialogDescription>{`Cette ${labels.singular.toLowerCase()} et son historique disparaissent : le geste est irréversible. Pour la ranger sans la perdre, archivez-la.`}</DialogDescription>
        </DialogHeader>
        {failure && (
          <div role="alert" className="grid gap-1 rounded-md border-l-[3px] border-l-danger bg-danger-subtle/40 p-2">
            <p className="text-sm">{failure.message}</p>
            {failure.blockers && failure.blockers.length > 0 && (
              <ul className="grid gap-0.5 text-xs">
                {failure.blockers.map((blocker) => (
                  <li key={blocker.key} className="tabular min-w-0 break-words">
                    {blocker.titles && blocker.titles.length > 0
                      ? `${blocker.label} : ${blocker.titles.join(", ")}${blocker.count > blocker.titles.length ? ` et ${blocker.count - blocker.titles.length} autre${blocker.count - blocker.titles.length > 1 ? "s" : ""}` : ""}`
                      : `${blocker.label} : ${blocker.count}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => change(false)}>
            Annuler
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void confirm()}>
            Supprimer définitivement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
