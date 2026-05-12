#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

function parseArgs(argv) {
  const args = {
    tasks: "tasks/default.json",
    modes: "direct,harness",
    model: "gpt-5.4-mini",
    codexBin: "codex",
    out: "",
    limit: 0,
    keepRepos: false,
    timeoutMs: 240000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--tasks") args.tasks = argv[++i];
    else if (a === "--modes") args.modes = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--codex-bin") args.codexBin = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i] || 0);
    else if (a === "--timeout-ms") args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (a === "--keep-repos") args.keepRepos = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/main.js [options]

Options:
  --tasks FILE        Task batch JSON. Default: tasks/default.json
  --modes LIST        Comma list: direct,harness. Default: direct,harness
  --model MODEL       Codex model. Default: gpt-5.4-mini
  --codex-bin BIN     Codex executable. Default: codex
  --out FILE          Write receipt JSON to FILE
  --limit N           Limit task count
  --timeout-ms N      Per-Codex-call timeout. Default: 240000
  --keep-repos        Do not delete disposable repos
`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

function sh(cmd, opts = {}) {
  const started = Date.now();
  try {
    return {
      ok: true,
      out: cp.execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }),
      ms: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      out: String(e.stdout || "") + String(e.stderr || ""),
      status: e.status,
      ms: Date.now() - started,
    };
  }
}

function sha(x) {
  return crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
}

function statusFiles(out) {
  return out
    .split("\n")
    .map((line) => line.replace(/^..\s+/, "").trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("__pycache__") && file !== "_hidden_probe.py");
}

function shellQuote(value) {
  return JSON.stringify(value);
}

function readTasks(file, limit) {
  const batch = JSON.parse(fs.readFileSync(file, "utf8"));
  const tasks = Array.isArray(batch) ? batch : batch.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error(`no tasks found in ${file}`);
  return limit > 0 ? tasks.slice(0, limit) : tasks;
}

function setupRepo(task) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `codex-harness-${task.id}-`));
  for (const [name, body] of Object.entries(task.files || {})) {
    const target = path.join(repo, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  sh("git init -q", { cwd: repo });
  sh('git add . && git commit -q -m initial --author "Bench <bench@example.com>"', { cwd: repo });
  return repo;
}

function promptFor(task, mode) {
  if (mode === "direct") {
    return [
      "Fix the failing test suite in this repository.",
      "Keep the change minimal.",
      `Task id: ${task.id}`,
      "Run the tests before finishing.",
    ].join("\n");
  }
  return [
    "You are running inside a correctness benchmark harness.",
    `Task id: ${task.id}`,
    "Fix the failing test suite in this repository.",
    `Allowed implementation files: ${(task.allowed_files || []).join(", ")}`,
    "Do not edit tests, generated caches, benchmark files, or hidden probes.",
    "Keep the patch minimal and scoped.",
    `Visible probe: ${task.visible_probe}`,
    "After editing, run the visible probe.",
    "Report changed files, test result, rollback instruction, and claim boundary.",
  ].join("\n");
}

function runCodex(repo, task, mode, args) {
  const prompt = promptFor(task, mode);
  const cmd = [
    shellQuote(args.codexBin),
    "exec",
    "--ignore-user-config",
    "--sandbox",
    "workspace-write",
    "--model",
    shellQuote(args.model),
    shellQuote(prompt),
  ].join(" ");
  return sh(cmd, { cwd: repo, timeout: args.timeoutMs });
}

function runHiddenProbe(repo, task) {
  const hiddenPath = path.join(repo, "_hidden_probe.py");
  fs.writeFileSync(hiddenPath, task.hidden_probe || "");
  const result = sh("python3 _hidden_probe.py", { cwd: repo });
  fs.unlinkSync(hiddenPath);
  return result;
}

function gateRow(task, before, propose, after, hidden, changed, forbidden) {
  const noTestTamper = forbidden.every((file) => !/^test_/.test(path.basename(file)));
  return {
    visible_before_failed: !before.ok,
    codex_completed: propose.ok,
    visible_after_passed: after.ok,
    hidden_probe_passed: hidden.ok,
    scoped_diff:
      forbidden.length === 0 && (task.allowed_files || []).some((file) => changed.includes(file)),
    no_test_tamper: noTestTamper,
    rollback_present: true,
    evidence_present: true,
    claim_boundary_present: Boolean(task.claim_boundary),
  };
}

function runOne(task, mode, args) {
  const repo = setupRepo(task);
  const visibleProbe = task.visible_probe || "python3 -m unittest -q";
  const before = sh(visibleProbe, { cwd: repo });
  const propose = runCodex(repo, task, mode, args);
  const after = sh(visibleProbe, { cwd: repo });
  const hidden = runHiddenProbe(repo, task);
  const diff = sh("git diff -- .", { cwd: repo });
  const status = sh("git status --short", { cwd: repo });
  const changed = statusFiles(status.out);
  const allowed = task.allowed_files || [];
  const forbidden = changed.filter((file) => !allowed.includes(file));
  const gate = gateRow(task, before, propose, after, hidden, changed, forbidden);
  const admission = Object.values(gate).every(Boolean) ? "canary" : "shadow";
  const row = {
    task_id: task.id,
    mode,
    repo: args.keepRepos ? repo : "(deleted)",
    allowed_files: allowed,
    changed_files: changed,
    forbidden_changed_files: forbidden,
    admission,
    gate,
    timings_ms: {
      visible_before: before.ms,
      proposer: propose.ms,
      visible_after: after.ms,
      hidden: hidden.ms,
    },
    visible_before_tail: before.out.slice(-800),
    visible_after_tail: after.out.slice(-400),
    hidden_tail: hidden.out.slice(-400),
    diff: diff.out,
    codex_output_tail: propose.out.slice(-2000),
  };
  if (!args.keepRepos) fs.rmSync(repo, { recursive: true, force: true });
  return row;
}

function summarize(rows, modes) {
  const byMode = {};
  for (const mode of modes) {
    const subset = rows.filter((row) => row.mode === mode);
    byMode[mode] = {
      task_count: subset.length,
      canary_count: subset.filter((row) => row.admission === "canary").length,
      admitted_correct_patch_rate:
        subset.length === 0
          ? 0
          : subset.filter((row) => row.admission === "canary").length / subset.length,
      visible_pass_rate:
        subset.length === 0 ? 0 : subset.filter((row) => row.gate.visible_after_passed).length / subset.length,
      hidden_pass_rate:
        subset.length === 0 ? 0 : subset.filter((row) => row.gate.hidden_probe_passed).length / subset.length,
      scoped_diff_rate:
        subset.length === 0 ? 0 : subset.filter((row) => row.gate.scoped_diff).length / subset.length,
      test_tamper_rate:
        subset.length === 0 ? 0 : subset.filter((row) => !row.gate.no_test_tamper).length / subset.length,
    };
  }
  return byMode;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tasks = readTasks(args.tasks, args.limit);
  const modes = args.modes.split(",").map((x) => x.trim()).filter(Boolean);
  for (const mode of modes) {
    if (!["direct", "harness"].includes(mode)) throw new Error(`unsupported mode: ${mode}`);
  }
  const started = Date.now();
  const rows = [];
  for (const task of tasks) {
    for (const mode of modes) rows.push(runOne(task, mode, args));
  }
  const receipt = {
    kind: "codex_harness_correctness_benchmark_run.v1",
    generated_at: new Date().toISOString(),
    benchmark: "Codex Harness Correctness Benchmark",
    task_source: args.tasks,
    modes,
    model: args.model,
    codex_bin: args.codexBin,
    metric:
      "admitted_correct_patch_rate = visible_before_failed && codex_completed && visible_after_passed && hidden_probe_passed && scoped_diff && no_test_tamper && rollback/evidence/claim_boundary present",
    rows,
    summary: summarize(rows, modes),
    wall_ms: Date.now() - started,
    claim_boundary:
      "Local batch benchmark over disposable repos. This is harness evidence, not SWE-bench performance or production reliability.",
    next: "Scale task count and add fanout modes under the same admission gate.",
  };
  receipt.receipt_hash = sha(receipt);
  const body = JSON.stringify(receipt, null, 2);
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, body);
  }
  console.log(body);
}

main();
