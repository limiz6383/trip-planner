// Test-only: lets node:test resolve the app's "@/..." path alias and extensionless
// TypeScript imports, so engine-level code can run under `node --test`.
import { register } from "node:module";
register("./test-alias-hooks.mjs", import.meta.url);
