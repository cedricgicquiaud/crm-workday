/** Le jour décalé de `days` jours, en `AAAA-MM-JJ` (calcul repris tel quel de `e2e/emails.spec.ts`). */
export function parisDayFromToday(days: number, at: Date = new Date()): string {
  return new Date(at.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
