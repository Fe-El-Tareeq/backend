const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INCLUDED_DIRS = ["src", "tests", "scripts", "prisma"];
const EXCLUDED_DIRS = new Set(["node_modules", "coverage"]);

const jsFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".js")) {
      jsFiles.push(fullPath);
    }
  }
}

for (const relativeDir of INCLUDED_DIRS) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (fs.existsSync(absoluteDir)) {
    walk(absoluteDir);
  }
}

let failures = 0;

for (const file of jsFiles.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failures > 0) {
  throw new Error(`${failures} JavaScript syntax check(s) failed.`);
}

console.log(`JavaScript syntax lint passed for ${jsFiles.length} files.`);
