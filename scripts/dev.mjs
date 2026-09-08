#!/usr/bin/env node
// Lance `next dev` sur le port de APP_URL, lu dans `.env.local` (puis `.env`).
// Un worktree qui a son propre `.env.local` a donc son propre port : deux livraisons peuvent
// tourner côte à côte sans se partager le 3000. Sans APP_URL : 3000, comme avant.
import { config } from "dotenv";
import { spawn } from "node:child_process";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

let port = "3000";
try { port = new URL(process.env.APP_URL ?? "").port || port } catch {}

const enfant = spawn("npx", ["next", "dev", "-p", port, ...process.argv.slice(2)], { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => enfant.kill(sig));
enfant.on("exit", code => process.exit(code ?? 0));
