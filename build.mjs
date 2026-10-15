import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];
const pluginDirectories = ["Omniscience", "Sage Eyes", "Aura Control", "Ephemeral Entity", "Tenshi's Plugins", "Avatar Handler"];

for (const pluginName of pluginDirectories) {
  const pluginPath = resolve("Revenge Plugins", pluginName);
  const outputPath = resolve("dist", "Revenge Plugins", pluginName);
  const legacyOutputPath = resolve("dist", "Revenge Plugin", pluginName);
  const manifestPath = resolve(pluginPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  await mkdir(outputPath, { recursive: true });

  const bundle = await rollup({
    input: resolve(pluginPath, manifest.main),
    external: (id) => id === "@vendetta" || id.startsWith("@vendetta/") || id === "react",
    plugins: [
      nodeResolve({ extensions }),
      commonjs(),
      {
        name: "swc",
        async transform(code, id) {
          const extension = extname(id);
          if (!extensions.includes(extension)) return null;

          const isTypeScript = extension.includes("ts");
          const result = await swc.transform(code, {
            filename: id,
            jsc: {
              externalHelpers: true,
              parser: {
                syntax: isTypeScript ? "typescript" : "ecmascript",
                tsx: isTypeScript ? extension.endsWith("x") : undefined,
                jsx: isTypeScript ? undefined : extension.endsWith("x"),
              },
            },
            env: {
              targets: "defaults",
              include: ["transform-classes", "transform-arrow-functions"],
            },
          });
          return result.code;
        },
      },
      esbuild({ minify: true }),
    ],
  });

  const builtEntry = resolve(outputPath, "index.js");
  await bundle.write({
    file: builtEntry,
    format: "iife",
    compact: true,
    exports: "named",
    globals(id) {
      if (id === "@vendetta") return "vendetta";
      if (id.startsWith("@vendetta/")) return id.slice(1).replaceAll("/", ".");
      if (id === "react") return "window.React";
      return id;
    },
  });
  await bundle.close();

  manifest.main = "index.js";
  manifest.hash = createHash("sha256").update(await readFile(builtEntry)).digest("hex");
  const builtManifest = JSON.stringify(manifest);
  await writeFile(resolve(outputPath, "manifest.json"), builtManifest);

  // Keep existing Revenge integration URLs working after the source tree is reorganized.
  await mkdir(legacyOutputPath, { recursive: true });
  await copyFile(builtEntry, resolve(legacyOutputPath, "index.js"));
  await writeFile(resolve(legacyOutputPath, "manifest.json"), builtManifest);

  console.log(`Built ${manifest.name} to ${outputPath}`);
}