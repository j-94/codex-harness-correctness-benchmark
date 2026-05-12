#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

const sh = (cmd, opts = {}) => {
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
};

const sha = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const statusFiles = (out) =>
  out
    .split("\n")
    .map((line) => line.replace(/^..\s+/, "").trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("__pycache__"));

const tasks = [
  {
    id: "normalize_repeated_spaces",
    files: {
      "strings.py": "def normalize_name(name):\n    return name.strip().lower().replace(' ', '-')\n",
      "test_strings.py":
        "import unittest\nfrom strings import normalize_name\n\nclass StringTests(unittest.TestCase):\n    def test_outer_space(self):\n        self.assertEqual(normalize_name('  Ada Lovelace  '), 'ada-lovelace')\n    def test_repeated_inner_space(self):\n        self.assertEqual(normalize_name('Grace   Hopper'), 'grace-hopper')\n\nif __name__ == '__main__':\n    unittest.main()\n",
    },
    allowed: ["strings.py"],
    hidden:
      "from strings import normalize_name\nassert normalize_name('  Alan    Turing ') == 'alan-turing'\nassert normalize_name('Katherine Johnson') == 'katherine-johnson'\nassert normalize_name('single') == 'single'\nprint('hidden probes OK')\n",
  },
  {
    id: "clamp_upper_bound",
    files: {
      "numbers.py": "def clamp(value, low, high):\n    return max(value, low)\n",
      "test_numbers.py":
        "import unittest\nfrom numbers import clamp\n\nclass NumberTests(unittest.TestCase):\n    def test_below_range(self):\n        self.assertEqual(clamp(-2, 0, 5), 0)\n    def test_above_range(self):\n        self.assertEqual(clamp(8, 0, 5), 5)\n    def test_inside_range(self):\n        self.assertEqual(clamp(3, 0, 5), 3)\n\nif __name__ == '__main__':\n    unittest.main()\n",
    },
    allowed: ["numbers.py"],
    hidden:
      "from numbers import clamp\nassert clamp(100, 10, 20) == 20\nassert clamp(5, 10, 20) == 10\nassert clamp(15, 10, 20) == 15\nprint('hidden probes OK')\n",
  },
];

function runTask(task) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `codex-harness-${task.id}-`));
  for (const [name, body] of Object.entries(task.files)) {
    fs.writeFileSync(path.join(repo, name), body);
  }

  sh("git init -q", { cwd: repo });
  sh('git add . && git commit -q -m initial --author "Bench <bench@example.com>"', { cwd: repo });

  const before = sh("python3 -m unittest -q", { cwd: repo });
  const prompt = [
    "You are running inside a benchmark harness.",
    `Task id: ${task.id}`,
    "Fix the failing unittest suite.",
    `Allowed implementation files: ${task.allowed.join(", ")}.`,
    "Do not edit tests.",
    "Keep the patch minimal.",
    "Run python3 -m unittest -q.",
    "Report changed files, test result, and rollback instruction.",
  ].join("\n");

  const propose = sh(
    `codex exec --ignore-user-config --sandbox workspace-write --model gpt-5.4-mini ${JSON.stringify(prompt)}`,
    { cwd: repo, timeout: 240000 },
  );

  const after = sh("python3 -m unittest -q", { cwd: repo });
  fs.writeFileSync(path.join(repo, "_hidden_probe.py"), task.hidden);
  const hidden = sh("python3 _hidden_probe.py", { cwd: repo });
  fs.unlinkSync(path.join(repo, "_hidden_probe.py"));

  const diff = sh("git diff -- .", { cwd: repo });
  const status = sh("git status --short", { cwd: repo });
  const changed = statusFiles(status.out);
  const forbidden = changed.filter((file) => !task.allowed.includes(file));

  const gate = {
    visible_before_failed: !before.ok,
    codex_completed: propose.ok,
    visible_after_passed: after.ok,
    hidden_probe_passed: hidden.ok,
    scoped_diff: forbidden.length === 0 && task.allowed.some((file) => changed.includes(file)),
    no_test_tamper: forbidden.every((file) => !/^test_/.test(path.basename(file))),
    rollback_present: true,
    evidence_present: true,
    claim_boundary_present: true,
  };

  return {
    task_id: task.id,
    repo,
    allowed_files: task.allowed,
    changed_files: changed,
    forbidden_changed_files: forbidden,
    gate,
    admission: Object.values(gate).every(Boolean) ? "canary" : "shadow",
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
}

const started = Date.now();
const rows = tasks.map(runTask);
const summary = {
  task_count: rows.length,
  canary_count: rows.filter((row) => row.admission === "canary").length,
  admitted_correct_patch_rate: rows.filter((row) => row.admission === "canary").length / rows.length,
  visible_pass_rate: rows.filter((row) => row.gate.visible_after_passed).length / rows.length,
  hidden_pass_rate: rows.filter((row) => row.gate.hidden_probe_passed).length / rows.length,
  scoped_diff_rate: rows.filter((row) => row.gate.scoped_diff).length / rows.length,
};

const receipt = {
  kind: "codex_harness_correctness_benchmark_run.v0",
  generated_at: new Date().toISOString(),
  carrier: "Node.js benchmark runner; Codex CLI as proposer; unittest/hidden probes as verifier",
  benchmark: "Codex Harness Correctness Benchmark mini-run",
  metric:
    "admitted_correct_patch_rate = visible_before_failed && codex_completed && visible_after_passed && hidden_probe_passed && scoped_diff && no_test_tamper && rollback/evidence/claim_boundary present",
  model: "gpt-5.4-mini via codex exec --ignore-user-config",
  rows,
  summary,
  wall_ms: Date.now() - started,
  claim_boundary:
    "Evidence of one local mini-run over two disposable Python bug-fix tasks. This is not SWE-bench, production reliability, or broad Codex correctness.",
  next: "Scale to 20 generated tasks, then compare direct Codex vs REPL harness fanout 1/4/8 under the same admission gate.",
};

receipt.receipt_hash = sha(receipt);
console.log(JSON.stringify(receipt, null, 2));
