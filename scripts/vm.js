const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertSafePath(filePath) {
  if (!filePath || typeof filePath !== "string") throw new Error("path must be a non-empty string");
  if (path.isAbsolute(filePath)) throw new Error(`absolute VM paths are not allowed: ${filePath}`);
  const normalized = path.posix.normalize(filePath.replaceAll(path.sep, "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`path escapes VM root: ${filePath}`);
  }
  return normalized;
}

function createVm(label = "codex-harness-vm") {
  const cells = new Map();
  const events = [];

  function write(filePath, content) {
    const safePath = assertSafePath(filePath);
    const body = String(content);
    const contentHash = sha256(body);
    cells.set(safePath, body);
    events.push({ op: "write", path: safePath, content_hash: contentHash, bytes: Buffer.byteLength(body) });
    return { path: safePath, content_hash: contentHash };
  }

  function read(filePath) {
    const safePath = assertSafePath(filePath);
    if (!cells.has(safePath)) throw new Error(`VM path not found: ${safePath}`);
    return cells.get(safePath);
  }

  function snapshot() {
    const files = [...cells.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([filePath, content]) => ({
        path: filePath,
        content,
        content_hash: sha256(content),
        bytes: Buffer.byteLength(content),
      }));
    const manifest = {
      kind: "codex_harness_vm_snapshot.v0",
      label,
      files: files.map(({ path: filePath, content_hash, bytes }) => ({ path: filePath, content_hash, bytes })),
      events,
    };
    return {
      ...manifest,
      snapshot_hash: sha256(stableJson(manifest)),
      files,
    };
  }

  function materialize(root) {
    const snap = snapshot();
    for (const file of snap.files) {
      const target = path.join(root, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content);
    }
    const files = snap.files.map(({ path: filePath, content_hash, bytes }) => ({ path: filePath, content_hash, bytes }));
    return {
      root,
      snapshot_hash: snap.snapshot_hash,
      files,
      materialization_hash: sha256(stableJson({ source: "materialized-from-vm", snapshot_hash: snap.snapshot_hash, files })),
    };
  }

  return { write, read, snapshot, materialize };
}

module.exports = { createVm, stableJson, sha256 };
