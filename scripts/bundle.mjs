// Bundle a TS entry (+ our workspace packages, which ship as .ts) into one plain-JS file.
//   default      : third-party packages stay external (resolved from node_modules at runtime)
//   --standalone : everything is bundled EXCEPT @prisma/client (needs its engine file) and the
//                  optional Redis libs (bullmq/ioredis, only loaded when REDIS_URL is set).
//                  Used for the "no npm install" Hostinger package.
import { build } from "esbuild";
const args = process.argv.slice(2);
const standalone = args.includes("--standalone");
const [entry, outfile] = args.filter((a) => !a.startsWith("--"));
const KEEP = ["@prisma/client", ".prisma/client", "bullmq", "ioredis"];
const external = { name: "externalize-deps", setup(b) {
  b.onResolve({ filter: /^[^./]/ }, (a) => {
    if (a.path.startsWith("@leadhunter/")) return null;
    if (!standalone) return { path: a.path, external: true };
    return KEEP.some((k) => a.path === k || a.path.startsWith(k + "/")) ? { path: a.path, external: true } : null;
  });
} };
await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", target: "node20", format: "cjs",
  sourcemap: !standalone, minify: standalone, logLevel: "info", plugins: [external] });
