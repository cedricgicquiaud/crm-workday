import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { overdueTasks } from "@/features/activities/overdue";

/** Familles de teinte des signalements (fondations « Signalement ») : une par gravité, jamais une par valeur. */
export type BannerTone = "danger" | "warning" | "info";

export type Banner = { rank: string; tone: BannerTone; message: string };

/**
 * Rangs de signalement d'une fiche (D5), du plus grave au moins grave. La livraison 2.3 n'en alimente
 * qu'un — la tâche échue ; 2.6a (doublon probable) et 2.6b (fiche archivée) ajoutent leur source à
 * `SOURCES` sans toucher au reste. L'ordre est déclaré, il ne dépend jamais de l'ordre des imports.
 */
export const BANNER_RANKS: readonly { key: string; order: number }[] = [
  { key: "archivee", order: 10 },
  { key: "doublon", order: 20 },
  { key: "tache_echue", order: 30 },
];

const rankOrder = (rank: string) => BANNER_RANKS.find((declared) => declared.key === rank)?.order ?? Number.MAX_SAFE_INTEGER;

/** Signalements du plus grave au moins grave. */
export const sortBanners = (banners: readonly Banner[]): Banner[] => [...banners].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

/** Une source de signalement : elle lit une fiche et rend les bannières qu'elle justifie. */
type BannerSource = (type: string, id: string) => Promise<Banner[]>;

/** « 1 tâche échue. », « 3 tâches échues. » — une seule bannière quel que soit le nombre (contrat 12). */
async function overdueTasksBanner(type: string, id: string): Promise<Banner[]> {
  const tasks = await overdueTasks(type, id);
  if (tasks.length === 0) return [];
  const plural = tasks.length > 1 ? "s" : "";
  return [{ rank: "tache_echue", tone: "warning", message: `${tasks.length} tâche${plural} échue${plural}.` }];
}

/** Une ligne par source ; les livraisons suivantes ajoutent la leur ici. */
const SOURCES: readonly BannerSource[] = [overdueTasksBanner];

/** Tous les signalements d'une fiche, du plus grave au moins grave. */
export async function collectBanners(type: string, id: string): Promise<Banner[]> {
  const found = await Promise.all(SOURCES.map((source) => source(type, id)));
  return sortBanners(found.flat());
}

const TONES: Record<BannerTone, string> = {
  danger: "border-l-danger bg-danger-subtle/40",
  warning: "border-l-warning bg-warning-subtle/40",
  info: "border-l-info bg-info-subtle/40",
};

/**
 * Bannière en haut du contenu d'une fiche (D5, fondations « Signalement ») : **une seule à la fois**,
 * la plus grave, bordure gauche de 3 px à la teinte de sa famille ; les autres sont comptées à côté.
 * Sans signalement, rien ne s'affiche. Elle informe, elle n'interrompt pas : `role="status"`.
 */
export async function SheetBanners({ type, id }: { type: string; id: string }) {
  const banners = await collectBanners(type, id);
  if (banners.length === 0) return null;
  const [first, ...others] = banners;
  return (
    <Alert role="status" className={cn("border-l-[3px]", TONES[first.tone])}>
      <AlertTitle>{first.message}</AlertTitle>
      {others.length > 0 && <AlertDescription>{`et ${others.length} autre signalement${others.length > 1 ? "s" : ""}`}</AlertDescription>}
    </Alert>
  );
}
