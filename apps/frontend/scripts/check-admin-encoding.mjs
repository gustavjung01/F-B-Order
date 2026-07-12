import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app/admin", "components/admin"];
const extensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const suspiciousPatterns = [
  { name: "UTF-8 replacement character", pattern: /�/u },
  { name: "common UTF-8 mojibake", pattern: /(?:Ã|Â|Ä|á»|áº|â€¦|â€”|â†’|âš)/u },
];

async function sourceFiles(relativeDirectory) {
  const entries = await readdir(relativeDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(relativePath));
    else if (extensions.has(path.extname(entry.name))) files.push(relativePath);
  }

  return files;
}

const failures = [];

for (const root of roots) {
  for (const file of await sourceFiles(root)) {
    const content = await readFile(file, "utf8");

    if (content.startsWith("\uFEFF")) {
      failures.push(`${file}: unexpected UTF-8 BOM`);
    }

    for (const check of suspiciousPatterns) {
      if (check.pattern.test(content)) failures.push(`${file}: ${check.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Admin source encoding check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Admin source encoding check passed.");
}
