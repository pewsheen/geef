import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ZipArchive } from "archiver";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = join(projectRoot, "manifest.json");
const packagePath = join(projectRoot, "package.json");
const outputDirectory = join(projectRoot, "dist");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: manifest.json is ${manifest.version}, but package.json is ${packageJson.version}.`,
  );
}

const archiveName = `geef-${manifest.version}.zip`;
const archivePath = join(outputDirectory, archiveName);
const checksumPath = `${archivePath}.sha256`;
const packageEntries = [
  { source: "manifest.json", destination: "manifest.json" },
  { source: "LICENSE", destination: "LICENSE" },
  { source: "src", destination: "src", directory: true },
  {
    source: "store-assets/icons",
    destination: "store-assets/icons",
    directory: true,
  },
];

await validateManifestFiles(manifest);
await mkdir(outputDirectory, { recursive: true });
await rm(archivePath, { force: true });
await rm(checksumPath, { force: true });

const output = createWriteStream(archivePath);
const zip = new ZipArchive("zip", { zlib: { level: 9 } });
const completed = new Promise((resolveCompleted, rejectCompleted) => {
  output.on("close", resolveCompleted);
  output.on("error", rejectCompleted);
  zip.on("error", rejectCompleted);
});

zip.pipe(output);

for (const entry of packageEntries) {
  const sourcePath = join(projectRoot, entry.source);
  if (entry.directory) {
    zip.directory(sourcePath, entry.destination);
  } else {
    zip.file(sourcePath, { name: entry.destination });
  }
}

await zip.finalize();
await completed;

const checksum = await sha256(archivePath);
await writeFile(checksumPath, `${checksum}  ${archiveName}\n`, "utf8");

if (process.argv.includes("--remove-pnpm-tarball")) {
  await removePnpmTarball(packageJson.name, packageJson.version);
}

const archiveStats = await stat(archivePath);
console.log(
  `Created ${relative(projectRoot, archivePath)} (${formatBytes(archiveStats.size)})`,
);
console.log(`SHA-256 ${checksum}`);
console.log("Included: manifest.json, LICENSE, src/, store-assets/icons/");

async function validateManifestFiles(value) {
  const referencedPaths = new Set([
    value.background?.service_worker,
    value.side_panel?.default_path,
    ...Object.values(value.icons || {}),
    ...Object.values(value.action?.default_icon || {}),
    ...(value.content_scripts || []).flatMap((script) => script.js || []),
    ...(value.content_scripts || []).flatMap((script) => script.css || []),
  ]);

  for (const referencedPath of [...referencedPaths].filter(Boolean)) {
    const absolutePath = resolve(projectRoot, referencedPath);
    const projectPrefix = `${projectRoot}${sep}`;
    if (
      absolutePath !== projectRoot &&
      !absolutePath.startsWith(projectPrefix)
    ) {
      throw new Error(`Manifest path escapes the project: ${referencedPath}`);
    }

    try {
      await stat(absolutePath);
    } catch {
      throw new Error(`Manifest references a missing file: ${referencedPath}`);
    }
  }
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function removePnpmTarball(name, version) {
  const tarballName = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
  const tarballPath = resolve(projectRoot, tarballName);

  if (dirname(tarballPath) !== projectRoot) {
    throw new Error(
      `Refusing to remove a tarball outside the project: ${tarballName}`,
    );
  }

  await rm(tarballPath, { force: true });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
