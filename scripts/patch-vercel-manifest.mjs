#!/usr/bin/env node
// Repairs a real bug in vite-plugin-vercel's SSR bundling: re-processing the
// already-built SSR chunk through its own separate Rolldown build re-triggers
// TanStack Start's virtual `tanstack-start-manifest:v` module in a context
// that resolves to dev mode, silently replacing the correct production route
// manifest with one whose only script is the dev-only
// `/@id/virtual:tanstack-start-dev-client-entry` entry — which 404s at
// runtime, so the client bundle never loads and the page never hydrates.
// This is easy to miss because SSR still renders real content; the page
// looks fine until you check whether anything is interactive.
//
// The correct manifest is already sitting in dist/server's output, produced
// by the very same `vite build` invocation before vite-plugin-vercel's
// separate pass corrupts its own copy. This substitutes it back in.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const BROKEN_MARKER = "virtual:tanstack-start-dev-client-entry";
const ASSIGNMENT_NEEDLE = "tsrStartManifest = () => (";

async function findOne(dir, pattern) {
  const entries = await readdir(dir, { withFileTypes: true });
  const match = entries.find((e) => e.isFile() && pattern.test(e.name));
  return match ? path.join(dir, match.name) : null;
}

async function loadCorrectManifest() {
  const assetsDir = path.join(root, "dist", "server", "assets");
  const file = await findOne(assetsDir, /^_tanstack-start-manifest[_:]v-.*\.js$/);
  if (!file) {
    throw new Error(
      `Could not find the correct manifest chunk under ${assetsDir} — did "vite build" run before this script?`,
    );
  }
  const mod = await import(pathToFileURL(file).href);
  const manifest = mod.tsrStartManifest();
  if (JSON.stringify(manifest).includes(BROKEN_MARKER)) {
    throw new Error(
      "The manifest from dist/server also contains the dev client entry — refusing to patch with bad data. " +
        "The bug this script exists to fix may have moved upstream.",
    );
  }
  return manifest;
}

// Finds the `tsrStartManifest = () => (<expr>);` assignment nearest before
// `fromIndex` and returns its [start, end) span, via balanced-paren scanning
// rather than regex — the manifest object is deeply nested and Rolldown's
// exact chunk/variable naming isn't stable across builds.
function findAssignmentSpan(content, fromIndex) {
  const assignAt = content.lastIndexOf(ASSIGNMENT_NEEDLE, fromIndex);
  if (assignAt === -1) return null;
  let i = assignAt + ASSIGNMENT_NEEDLE.length - 1; // position of the opening '('
  let depth = 0;
  for (; i < content.length; i++) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") {
      depth--;
      if (depth === 0) {
        i++;
        if (content[i] === ";") i++;
        return [assignAt, i];
      }
    }
  }
  return null;
}

async function patchFunctionFile(file, manifest) {
  const content = await readFile(file, "utf8");
  const markerIndex = content.indexOf(BROKEN_MARKER);
  if (markerIndex === -1) {
    console.log(
      `[patch-vercel-manifest] ${path.relative(root, file)}: no dev-entry marker found, nothing to patch.`,
    );
    return false;
  }
  const span = findAssignmentSpan(content, markerIndex);
  if (!span) {
    throw new Error(
      `Found the broken marker in ${file} but could not locate the enclosing tsrStartManifest assignment to replace.`,
    );
  }
  const [start, end] = span;
  const replacement = `${ASSIGNMENT_NEEDLE}${JSON.stringify(manifest)});`;
  const patched = content.slice(0, start) + replacement + content.slice(end);
  await writeFile(file, patched, "utf8");
  console.log(
    `[patch-vercel-manifest] ${path.relative(root, file)}: replaced the dev-mode manifest with the correct production manifest.`,
  );
  return true;
}

async function main() {
  const functionsDir = path.join(root, ".vercel", "output", "functions");
  if (!existsSync(functionsDir)) {
    console.log("[patch-vercel-manifest] .vercel/output/functions not found — nothing to do.");
    return;
  }
  const manifest = await loadCorrectManifest();
  const funcDirs = await readdir(functionsDir, { withFileTypes: true });
  let patchedAny = false;
  for (const dir of funcDirs) {
    if (!dir.isDirectory()) continue;
    const funcPath = path.join(functionsDir, dir.name);
    const entryFile =
      (await findOne(funcPath, /^index\.mjs$/)) ?? (await findOne(funcPath, /^index\.js$/));
    if (!entryFile) continue;
    if (await patchFunctionFile(entryFile, manifest)) patchedAny = true;
  }
  if (!patchedAny) {
    console.warn(
      "[patch-vercel-manifest] WARNING: no function file needed patching. If vite-plugin-vercel's " +
        "manifest bug is still present, this script did not find it — verify the deployment manually " +
        "rather than trusting this silently.",
    );
  }
}

main().catch((err) => {
  console.error("[patch-vercel-manifest] FAILED:", err);
  process.exit(1);
});
