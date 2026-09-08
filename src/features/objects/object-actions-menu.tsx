"use client";

import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Props = { type: string; id: string; archived: boolean };

const FAILED = "L'action n'a pas pu être menée.";

/**
 * Menu d'actions d'une fiche (D5, contrat 30) : « Archiver » quand elle est vivante, « Restaurer »
 * quand elle est rangée — le geste est réversible et ouvert à tout membre. La livraison 2.6a y
 * ajoutera « Fusionner ». Bouton secondaire : le bouton plein d'un écran reste celui de la création.
 *
 * Aucun échec n'est avalé : un refus du serveur (fiche déjà archivée, panne réseau) s'affiche sous
 * le menu en `role="alert"`, et l'écran reste dans l'état enregistré tant que la réponse n'est pas 2xx.
 */
export function ObjectActionsMenu({ type, id, archived }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="grid justify-items-end gap-1">
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
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
