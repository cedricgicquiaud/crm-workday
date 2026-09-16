import Link from "next/link";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { overdueTasks } from "@/features/activities/overdue";
import { duplicatesOfRecord } from "@/features/duplicates/duplicates";
import { duplicateMessage, MERGE_PARAM } from "@/features/duplicates/normalize";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord, type ObjectRecord } from "@/features/objects/service";

/** Familles de teinte des signalements (fondations « Signalement ») : une par gravité, jamais une par valeur. */
export type BannerTone = "danger" | "warning" | "info";

/** Ce que la bannière propose de faire ; le lien reste sur la fiche et porte de quoi ouvrir le geste. */
export type BannerAction = { label: string; href: string };

/** `links` : les fiches que la bannière nomme, ouvertes à tous (« Converti le … » mène à deux fiches) ; `action` reste le geste réservé. */
export type Banner = { rank: string; tone: BannerTone; message: string; action?: BannerAction; links?: readonly BannerAction[] };

/**
 * Rangs de signalement d'une fiche (D5), du plus grave au moins grave : fiche archivée, doublon
 * probable, tâche échue. Chaque livraison ajoute sa source à `SOURCES` sans toucher au reste.
 * L'ordre est déclaré, il ne dépend jamais de l'ordre des imports.
 */
export const BANNER_RANKS: readonly { key: string; order: number }[] = [
  { key: "archivee", order: 10 },
  { key: "doublon", order: 20 },
  { key: "tache_echue", order: 30 },
];

/** Rang d'un signalement parmi les communs et ceux que l'objet déclare (D21). */
const rankOrder = (rank: string, declared: readonly { rank: string; order: number }[]) =>
  BANNER_RANKS.find((common) => common.key === rank)?.order ?? declared.find((own) => own.rank === rank)?.order ?? Number.MAX_SAFE_INTEGER;

/** Signalements du plus grave au moins grave ; `declared` range les bannières propres à l'objet parmi les communes. */
export const sortBanners = (banners: readonly Banner[], declared: readonly { rank: string; order: number }[] = []): Banner[] =>
  [...banners].sort((a, b) => rankOrder(a.rank, declared) - rankOrder(b.rank, declared));

/** Une source de signalement : elle lit une fiche (déjà chargée une fois pour toutes) et rend les bannières qu'elle justifie. */
type BannerSource = (type: string, id: string, record: ObjectRecord) => Promise<Banner[]>;

/** « 1 tâche échue. », « 3 tâches échues. » — une seule bannière quel que soit le nombre (contrat 12). */
async function overdueTasksBanner(type: string, id: string): Promise<Banner[]> {
  const tasks = await overdueTasks(type, id);
  if (tasks.length === 0) return [];
  const plural = tasks.length > 1 ? "s" : "";
  return [{ rank: "tache_echue", tone: "warning", message: `${tasks.length} tâche${plural} échue${plural}.` }];
}

/**
 * « Entreprise archivée : la fiche est en lecture seule. » (contrat 30). Le ton dit un état inerte,
 * pas un défaut : la fiche est intacte, seule l'écriture est fermée, et « restaurer » la rouvre.
 */
async function archivedBanner(type: string, _id: string, record: ObjectRecord): Promise<Banner[]> {
  if (!record.archivedAt) return [];
  return [{ rank: "archivee", tone: "info", message: `${getObject(type).labels.singular} archivée : la fiche est en lecture seule.` }];
}

/**
 * « Doublon probable : « ACME SAS » porte un nom très proche. » (D19, contrat 28). Le signal est
 * porté par les deux fiches, et son lien ramène sur la fiche courante en ouvrant la fusion : c'est
 * elle qu'on garde par défaut. Plusieurs jumelles se comptent — les nommer toutes ferait un pavé.
 */
async function duplicateBanner(type: string, id: string): Promise<Banner[]> {
  const duplicates = await duplicatesOfRecord(type, id);
  if (duplicates.length === 0) return [];
  const message = duplicateMessage(duplicates.map((duplicate) => duplicate.title));
  return [{ rank: "doublon", tone: "warning", message, action: { label: "Fusionner…", href: `${getObject(type).href(id)}?${MERGE_PARAM}=${duplicates[0].id}` } }];
}

/** Une ligne par source ; les livraisons suivantes ajoutent la leur ici. */
const SOURCES: readonly BannerSource[] = [archivedBanner, duplicateBanner, overdueTasksBanner];

/** Tous les signalements d'une fiche, communs et déclarés par son objet (D21), du plus grave au moins grave. */
export async function collectBanners(type: string, id: string): Promise<Banner[]> {
  const record = await getObjectRecord(type, id);
  const declared = getServerObject(type).banners ?? [];
  const found = await Promise.all([...SOURCES.map((source) => source(type, id, record)), ...declared.map((own) => own.source(record))]);
  return sortBanners(found.flat(), declared);
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
 *
 * `showAction` : le geste que propose la bannière n'est pas ouvert à tous (la fusion est réservée à
 * un administrateur, contrat 31). La page qui rend la fiche connaît le rôle et le dit ici ; sans
 * elle, le lien mènerait à un écran qui ne s'ouvre pas.
 */
export async function SheetBanners({ type, id, showAction = false }: { type: string; id: string; showAction?: boolean }) {
  const banners = await collectBanners(type, id);
  if (banners.length === 0) return null;
  const [first, ...others] = banners;
  const action = showAction ? first.action : undefined;
  return (
    <Alert role="status" className={cn("border-l-[3px]", TONES[first.tone])}>
      <AlertTitle>{first.message}</AlertTitle>
      {(action || others.length > 0 || (first.links?.length ?? 0) > 0) && (
        <AlertDescription>
          {first.links?.map((link) => (
            <Link key={link.href} href={link.href} title={link.label} className="min-w-0 truncate font-medium underline underline-offset-2 focus-visible:rounded-sm">
              {link.label}
            </Link>
          ))}
          {action && (
            <Link href={action.href} className="font-medium underline underline-offset-2">
              {action.label}
            </Link>
          )}
          {others.length > 0 && <span>{`et ${others.length} autre signalement${others.length > 1 ? "s" : ""}`}</span>}
        </AlertDescription>
      )}
    </Alert>
  );
}
