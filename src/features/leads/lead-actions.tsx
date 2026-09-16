"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Les gestes d'avancement d'un lead (D7) : leur route et leur libellé. */
const GESTURES = {
  ecarter: { label: "Écarter", failed: "Le lead n'a pas pu être écarté." },
  rouvrir: { label: "Rouvrir", failed: "Le lead n'a pas pu être rouvert." },
} as const;

export type LeadGesture = keyof typeof GESTURES;

/**
 * Bouton « Écarter » ou « Rouvrir » de l'en-tête d'un lead (D7). Bouton secondaire : le bouton plein
 * d'un écran reste celui de la création. L'écran ne suit qu'après la réponse 2xx ; un refus (lead
 * archivé, déjà écarté) s'affiche sous le bouton en `role="alert"` et la fiche reste telle qu'enregistrée.
 */
export function LeadStageAction({ id, gesture }: { id: string; gesture: LeadGesture }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { label, failed } = GESTURES[gesture];

  async function run() {
    setPending(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/leads/${encodeURIComponent(id)}/${gesture}`, { method: "POST" });
    } catch {
      setPending(false);
      setError(failed);
      return;
    }
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? failed);
      return;
    }
    router.refresh();
  }

  return (
    <div data-slot="lead-action" className="grid justify-items-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => void run()}>
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
