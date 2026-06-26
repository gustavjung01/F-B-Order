import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBuildId, renderServiceWorker, writePwaRelease } from "./write-app-version.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, "service-worker.template.js");

test("createBuildId produces release-specific IDs", function () {
  const first = createBuildId({
    git: "abc123",
    builtAt: "2026-06-26T00:00:00.000Z",
    deploymentId: "dpl_first",
    entropy: "111111",
  });
  const second = createBuildId({
    git: "abc123",
    builtAt: "2026-06-26T00:00:00.000Z",
    deploymentId: "dpl_second",
    entropy: "222222",
  });

  assert.notEqual(first, second);
});

test("renderServiceWorker rejects a template without the build placeholder", function () {
  assert.throws(function () {
    renderServiceWorker("const BUILD_ID = 'static';", "release-1");
  }, /Missing __PWA_BUILD_ID__/);
});

test("generator writes matching build IDs and the release lifecycle invariants", function () {
  const publicDir = mkdtempSync(join(tmpdir(), "fb-order-pwa-"));
  const buildId = "abc123-dpl_test-abcdef123456";

  try {
    const result = writePwaRelease({
      publicDir,
      templatePath,
      git: "abc123",
      builtAt: "2026-06-26T00:00:00.000Z",
      buildId,
    });

    const appVersion = JSON.parse(readFileSync(result.appVersionPath, "utf8"));
    const worker = readFileSync(result.serviceWorkerPath, "utf8");

    assert.equal(appVersion.buildId, buildId);
    assert.equal(appVersion.version, buildId);
    assert.match(worker, new RegExp(`const BUILD_ID = ${JSON.stringify(buildId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(worker, /"bep-si-fb-pwa-" \+ BUILD_ID/);
    assert.match(worker, /"bep-si-fb-assets-" \+ BUILD_ID/);
    assert.match(worker, /self\.skipWaiting\(\)/);
    assert.match(worker, /self\.clients\.claim\(\)/);
    assert.match(worker, /fetch\(event\.request, \{ cache: "no-store" \}\)/);
    assert.match(worker, /\/_next\/static\//);
    assert.doesNotMatch(worker, /bep-si-fb-(?:pwa|runtime)-v12/);
    assert.doesNotMatch(worker, /NAVIGATION_TIMEOUT_MS/);
    assert.doesNotMatch(worker, /caches\.match\("\/"\)/);
  } finally {
    rmSync(publicDir, { recursive: true, force: true });
  }
});
