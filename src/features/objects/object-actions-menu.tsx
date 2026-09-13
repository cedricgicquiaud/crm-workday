"use client";

import { ChevronDownIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/features/archive/delete-dialog";
import { MERGE_PARAM } from "@/features/duplicates/normalize";
import { MergeDialog } from "@/features/merge/merge-dialog";

/** `canDelete` : la suppression définitive et la fusion sont des gestes d'administrateur (contrat 31) ; les routes les refusent de leur côté. */
type Props = { type: string; id: string; title: string; archived: boolean; canDelete: boolean };

const FAILED = "L'action n'a pas pu être menée.";

/**
 * Menu d'actions d'une fiche (D5, contrats 30 et 31) : « Archiver » quand elle est vivante,
 * « Restaurer » quand elle est rangée — le geste est réversible et ouvert à tout membre — puis
 * « Fusionner… » et « Supprimer définitivement », que seul un administrateur voit. Cacher la
 * commande n'est jamais la protection : la route répond 403 de son côté. Bouton secondaire : le
 * bouton plein d'un écran reste celui de la création.
 *
 * Le lien « Fusionner… » de la bannière de doublon ouvre le même dialogue : il ramène sur la fiche
 * avec la jumelle en paramètre d'adresse, et le paramètre repart quand le dialogue se ferme.
 *
 * Aucun échec n'est avalé : un refus du serveur (fiche déjà archivée, panne réseau) s'affiche sous
 * le menu en `role="alert"`, et l'écran reste dans l'état enregistré tant que la réponse n'est pas 2xx.
 */
export function ObjectActionsMenu({ type, id, title, archived, canDelete }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const twin = useSearchParams().get(MERGE_PARAM);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  /* La bannière ouvre la fusion par l'adresse : le paramètre suffit, aucun état à synchroniser. Un membre qui suivrait le lien n'a pas le dialogue, la page s'affiche telle quelle. */
  const mergeOpen = canDelete && (merging || twin !== null);

  function closeMerge(next: boolean) {
    setMerging(next);
    /* Le paramètre repart avec le dialogue : sans cela, un rechargement le rouvrirait. */
    if (!next && twin) router.replace(pathname);
  }

  async function run(action: "archiver" | "restaurer") {
    let res: Response;
    try {
      res = await fetch(`/api/objets/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    } catch {
      setError(FAILED);
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? FAILED);
      return;
    }
    setError(null);
    router.refresh();
  }

  /* Les actions ferment la ligne de titre, à droite : le titre et le type se lisent d'abord. */
  return (
    <div className="ml-auto grid justify-items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          Actions
          <ChevronDownIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {archived ? (
            <DropdownMenuItem onClick={() => void run("restaurer")}>Restaurer</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => void run("archiver")}>Archiver</DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setMerging(true)}>Fusionner…</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                Supprimer définitivement
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Hors du menu : celui-ci se ferme au clic sur sa commande, et emporterait le dialogue avec lui. */}
      {canDelete && <DeleteDialog type={type} id={id} open={deleting} onOpenChange={setDeleting} />}
      {canDelete && <MergeDialog type={type} id={id} title={title} other={twin} open={mergeOpen} onOpenChange={closeMerge} />}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
