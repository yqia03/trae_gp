import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stage = await mkdtemp(path.join(tmpdir(), "jdqc-pages-"));
for (const file of ["package.json", "tsconfig.json", "postcss.config.mjs", "public", "src"]) {
  await cp(path.join(root, file), path.join(stage, file), {
    recursive: true,
    filter: (source) => source !== path.join(root, "src/app/api"),
  });
}
await symlink(path.join(root, "node_modules"), path.join(stage, "node_modules"), "dir");
await writeFile(path.join(stage, "next.config.mjs"), `export default {
  output: "export", basePath: "/trae_gp", images: { unoptimized: true },
  env: { NEXT_PUBLIC_DEMO_ONLY: "true", NEXT_PUBLIC_BASE_PATH: "/trae_gp" }
};`);
const build = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
  cwd: stage, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
if (build.status !== 0) process.exit(build.status || 1);
await mkdir(path.join(root, "out"), { recursive: true });
await cp(path.join(stage, "out"), path.join(root, "out"), { recursive: true });
await writeFile(path.join(root, "out/.nojekyll"), "");
console.log("GitHub Pages demo exported to out/; server API routes and .env files excluded.");
