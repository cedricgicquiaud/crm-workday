"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { saveTheme } from "@/features/theme/apply-theme";
import { isTheme, THEME_LABELS, THEMES, type Theme } from "@/features/theme/theme";

type Outcome = { kind: "status" | "alert"; text: string } | null;

/** Mon profil → Thème : clair, sombre ou système (D13, D17). Appliqué tout de suite, enregistré sur l'utilisateur. */
export function ThemePreference({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function choose(value: unknown) {
    if (!isTheme(value)) return;
    setTheme(value);
    const saved = await saveTheme(value);
    setOutcome(saved ? { kind: "status", text: "Thème enregistré." } : { kind: "alert", text: "L'enregistrement du thème a échoué. Réessayez." });
  }

  return (
    <div className="grid gap-3">
      <RadioGroup aria-label="Thème" value={theme} onValueChange={choose} className="gap-2">
        {THEMES.map((value) => (
          <div key={value} className="flex items-center gap-2">
            <RadioGroupItem id={`theme-${value}`} value={value} />
            <Label htmlFor={`theme-${value}`}>{THEME_LABELS[value]}</Label>
          </div>
        ))}
      </RadioGroup>
      <p className="text-xs text-muted-foreground">« Système » suit le réglage clair ou sombre de votre appareil. Le choix vous suit sur tous vos navigateurs.</p>
      {outcome && (
        <p role={outcome.kind} className={outcome.kind === "alert" ? "text-xs text-danger" : "text-sm"}>
          {outcome.text}
        </p>
      )}
    </div>
  );
}
