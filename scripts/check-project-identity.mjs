import { readFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const constants = await readFile("src/constants.ts", "utf8");
const manifest = await readJson("public/manifest.json");
const local = await readJson("public/manifest-local.json");
const pkg = await readJson("package.json");
const readConstant = (name) => constants.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
const failures = [];
if (readConstant("EXTENSION_NAME") !== "OBR Ping") failures.push("EXTENSION_NAME must be OBR Ping");
if (readConstant("EXTENSION_ID") !== "com.ex-asperis.obr-ping") failures.push("EXTENSION_ID must be com.ex-asperis.obr-ping");
if (pkg.name !== "obr-ping") failures.push("package name must be obr-ping");
if (manifest.name !== "OBR Ping" || local.name !== "OBR Ping (Local)") failures.push("manifest names are incorrect");
if (manifest.author !== "ex Asperis" || local.author !== "ex Asperis") failures.push("manifest author must be ex Asperis");
if (local.action?.popover !== "http://localhost:5173/extension.html") failures.push("local popover URL is incorrect");
if (failures.length) throw new Error(`Project identity check failed:\n- ${failures.join("\n- ")}`);
console.log("Project identity verified: com.ex-asperis.obr-ping; published author ex Asperis.");
