// Bundle a TS entry (+ our workspace packages, which ship as .ts) into one plain-JS file.
// Third-party packages stay external (resolved from node_modules at runtime) — this keeps
// Prisma, argon2 and other native modules working. No dependence on Node's TS support.
import { build } from "esbuild";
const [entry, outfile] = process.argv.slice(2);
const external = { name: "externalize-deps", setup(b) {
  b.onResolve({ filter: /^[^./]/ }, (a) => (a.path.startsWith("@leadhunter/") ? null : { path: a.path, external: true }));
} };
await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", target: "node20", format: "cjs",
  sourcemap: true, logLevel: "info", plugins: [external] });
