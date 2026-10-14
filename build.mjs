import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];
const pluginDirectories = [
  ["Revenge Plugin", "Omniscience"],
  ["Revenge Plugin", "Sage Eyes"],
];

for (const pluginParts of pluginDirectories) {
  const pluginPath = resolve(...pluginParts);
  const outputPath = resolve("dist", ...pluginParts);
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
  await writeFile(resolve(outputPath, "manifest.json"), JSON.stringify(manifest));

  console.log(`Built ${manifest.name} to ${outputPath}`);
}