import { execSync } from "node:child_process";
import pkg from "../../package.json";

let commitCache: string | undefined;

/** Commit court : GIT_COMMIT (posé au déploiement), sinon lu dans le dépôt, sinon « inconnu ». */
export function getCommit(): string {
  if (commitCache) return commitCache;
  const fromEnv = process.env.GIT_COMMIT?.trim();
  if (fromEnv) return (commitCache = fromEnv.slice(0, 7));
  try {
    commitCache = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    commitCache = "inconnu";
  }
  return commitCache;
}

export function getVersion(): string {
  return pkg.version;
}
