// Raises the web app's version number. Run before every production push:
//   npm run version:bump            -> patch (1.0.0 -> 1.0.1)
//   npm run version:bump -- minor   -> minor (1.0.1 -> 1.1.0)
//   npm run version:bump -- major   -> major (1.1.0 -> 2.0.0)
// The version is shown in Super Admin -> Versions, with the build's commit and time.
import { readFileSync, writeFileSync } from "node:fs";

const kind = process.argv[2] ?? "patch";
const file = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(file, "utf8"));
const [major, minor, patch] = String(pkg.version).split(".").map((n) => Number.parseInt(n, 10) || 0);
const next = kind === "major" ? [major + 1, 0, 0] : kind === "minor" ? [major, minor + 1, 0] : [major, minor, patch + 1];
pkg.version = next.join(".");
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Web app version: ${major}.${minor}.${patch} -> ${pkg.version}`);
