import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { GET } from "@/app/api/health/route";

describe("route de santé (contrat 2)", () => {
  it("répond 200 avec la version de package.json et le commit court du dépôt", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.version);
    const commit = execSync("git rev-parse --short HEAD").toString().trim();
    expect(body.commit).toBe(commit);
  });
});
