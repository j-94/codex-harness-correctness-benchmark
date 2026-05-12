# Codex Harness Correctness Benchmark

This repository is a small standalone template for benchmarking and improving Codex-style coding agents.

It captures a live benchmark for the capability we actually want to test:

```text
Codex as a packet-switched correctness harness
```

The benchmark is not a claim that Codex broadly solves SWE-bench. It is a batchable harness for this loop:

```text
task packet
-> disposable repo
-> Codex proposer
-> visible probe
-> held-out probe
-> scoped-diff gate
-> admission decision
-> receipt
```

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

The runner creates disposable repos in your temp directory, asks Codex to patch each one, runs visible and hidden probes, gates the result, and writes a receipt.

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
