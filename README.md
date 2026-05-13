# Codex Harness Correctness Benchmark

This repository is a small standalone template for benchmarking and improving Codex-style coding agents.

It captures a live benchmark for the capability we actually want to test:

```text
Codex as a packet-switched correctness harness
```

It is also the remote-backed place to describe how the local `codex-clean`
harness should work with an Agent OS / UTIR carrier. `codex-clean` is the
boot/recovery surface: it holds instructions, compact state, receipts, and
claim boundaries. Agent OS / UTIR is the execution carrier: it turns a selected
intent into a typed operation tape before files, shell commands, git, or remote
updates are used as backends.

The benchmark is not a claim that Codex broadly solves SWE-bench. It is a batchable harness for this loop:

```text
task packet
-> VM overlay
-> VM snapshot hash
-> materialized disposable repo
-> Codex proposer
-> visible probe
-> held-out probe
-> scoped-diff gate
-> admission decision
-> receipt
```

## Codex-Clean Harness Symbiosis

The intended operating relationship is:

```text
codex-clean boot state
-> compact recovered ControlState / claim boundary
-> Agent OS REPL or TP(...)
-> WorkManifest / ControlPacket
-> UTIR-style op tape
-> gate: rollback + evidence + claim_boundary + path/tool scope
-> disposable backend effect
-> persisted receipt
-> codex-clean carries only the receipt-backed state forward
```

`codex-clean` should not be treated as a giant preloaded memory blob that makes
new strategic or filesystem claims true by itself. Its job is to route, recover,
and bound claims. Material effects should be selected by the typed op tape and
admitted by the gate.

Forbidden control path:

```text
preloaded instruction / chat intent
-> Codex decides files or git are useful
-> direct filesystem, shell, or remote mutation
```

Required control path:

```text
intent
-> recovered state
-> typed packet / UTIR op tape
-> gate and receipt preview
-> scoped backend materialization
```

Until a mechanical effect proxy exists, this is protocol-level governance. The
benchmark therefore records the control path, generated files, scoped diff,
rollback/evidence/claim-boundary fields, and receipt hash so later runs can
separate "the harness actually governed the work" from "the prompt merely said
it should."

## Capability Accuracy Program

The same pattern should be used for every capability claim, not only code
repair. Each claimed capability needs a paired same-model comparison:

```text
same model
same task
same budget
same allowed backends

A. direct Codex
B. controlled Codex through recovered state + typed op tape + gate + receipt
```

Claim lanes to add as task batches:

```text
retrieval learned tensors: route/evidence-handle accuracy
long context: preserved-action score per token
patch planning: right-file targeting, rollback, test plan
effect safety: unsafe-admit block rate
claim calibration: overclaim reduction
memory carry: next-turn state recovery
cognitive debt: teach-back / explanation accuracy
tool routing: wrong-surface rate
compression: compact packet preserves next action
execution: admitted result rate
```

A claim is promotable only when the controlled path beats or matches the direct
path on paired tasks and the receipt preserves failures, boundaries, and cost.

## Quick Start

Prerequisites:

```text
node
python3
git
codex
```

Run the default direct-vs-harness comparison:

```bash
npm run bench:compare -- --out receipts/local-run.json
```

Or call the runner directly:

```bash
node scripts/main.js \
  --tasks tasks/default.json \
  --modes direct,harness \
  --model gpt-5.4-mini \
  --out receipts/local-run.json
```

The runner generates task files in an in-process VM overlay, materializes that VM snapshot to a disposable repo in your temp directory, asks Codex to patch it, runs visible and hidden probes, gates the result, and writes a receipt.

## Main Entrypoint

```text
scripts/main.js
```

Task batches live in:

```text
tasks/default.json
```

Each task declares:

```json
{
  "id": "task id",
  "files": {},
  "allowed_files": [],
  "visible_probe": "python3 -m unittest -q",
  "hidden_probe": "python code",
  "claim_boundary": "what this task can prove"
}
```

## Modes

```text
direct
harness
```

`direct` gives Codex a plain repair instruction. `harness` gives Codex the allowed files, visible probe, rollback/claim-boundary expectations, and anti-test-tamper constraints.

The comparison metric is not raw pass rate. It is admitted correctness:

```text
tests pass
+ hidden probes pass
+ no test tamper
+ scoped diff
+ rollback/evidence/claim boundary
+ receipt
```

Each row also records:

```text
vm_snapshot_hash
materialization_hash
generated_files[]
```

## Latest Run

Receipt:

```text
receipts/20260512T-template-direct-vs-harness.json
```

Summary:

```text
direct:
  task_count: 2
  canary_count: 2
  admitted_correct_patch_rate: 1.0
  visible_pass_rate: 1.0
  hidden_pass_rate: 1.0
  scoped_diff_rate: 1.0
  test_tamper_rate: 0

harness:
  task_count: 2
  canary_count: 2
  admitted_correct_patch_rate: 1.0
  visible_pass_rate: 1.0
  hidden_pass_rate: 1.0
  scoped_diff_rate: 1.0
  test_tamper_rate: 0

receipt_hash: 8a32c27f7397abf136084cff8aae4732fd4c59f8e2db4686be746a7d66a3c428
```

Earlier receipts are intentionally included:

```text
receipts/20260512T172409Z-negative-parser-gate.json
receipts/20260512T172546Z-admitted-mini-run.json
```

The negative parser-gate run passed visible and hidden probes, but the admission gate rejected both rows because the benchmark normalized `git status` incorrectly. The corrected mini-run records that harness fix. The latest run uses the batchable direct-vs-harness CLI.

## Metric

```text
admitted_correct_patch_rate =
  visible_before_failed
  && codex_completed
  && visible_after_passed
  && hidden_probe_passed
  && scoped_diff
  && no_test_tamper
  && rollback_present
  && evidence_present
  && claim_boundary_present
```

## Boundary

Allowed claim:

```text
This repo contains evidence of one local mini-run over two disposable Python bug-fix tasks.
```

Not allowed:

```text
This proves SWE-bench performance, production reliability, or broad Codex correctness.
```

## Next Step

Scale this into a larger comparative benchmark:

```text
A. direct Codex
B. harness Codex
C. harness Codex, fanout 4
D. harness Codex, fanout 8
```

Compare admitted correct patches per unit cost.
