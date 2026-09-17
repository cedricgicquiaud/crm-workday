/**
 * Le jour civil de Paris décalé de `days` jours, en `AAAA-MM-JJ`. Le navigateur des tests d'écran
 * est réglé sur Paris : un jour pris sur minuit UTC retarde d'un jour entre 0 h et 2 h à Paris (CRM-99).
 */
export function parisDayFromToday(days: number, at: Date = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(at);
  const noon = new Date(`${today}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}
