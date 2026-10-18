import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tryFile(base) {
  for (const ext of ["", ".ts", ".tsx", "/index.ts", ".json"]) {
    const p = base + ext;
    if (existsSync(p) && !p.endsWith("/") && /\.[a-z]+$/.test(p)) return p;
  }
  return null;
}

function jsonAttr(file, context) {
  return file.endsWith(".json")
    ? { ...context, importAttributes: { ...context.importAttributes, type: "json" } }
    : context;
}

export async function resolve(specifier, context, next) {
  if (specifier === "@/lib/db/queries") {
    return next(pathToFileURL(path.join(root, "lib/test-stubs/queries.mjs")).href, context);
  }
  if (specifier.startsWith("@/")) {
    const hit = tryFile(path.join(root, specifier.slice(2)));
    if (hit) return next(pathToFileURL(hit).href, jsonAttr(hit, context));
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:") &&
    !/\.(ts|tsx|json|mjs|js)$/.test(specifier)
  ) {
    const hit = tryFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (hit) return next(pathToFileURL(hit).href, jsonAttr(hit, context));
  }
  if (specifier.endsWith(".json")) return next(specifier, jsonAttr(specifier, context));
  return next(specifier, context);
}
