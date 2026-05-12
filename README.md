# Codex Harness Correctness Benchmark

This repository captures a small, live benchmark for the capability we actually want to test:

```text
Codex as a packet-switched correctness harness
```

The benchmark is not a claim that Codex broadly solves SWE-bench. It is a minimal evidence artifact for this loop:

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

## Latest Run

Receipt:

```text
receipts/20260512T172546Z-admitted-mini-run.json
```

Summary:

```text
task_count: 2
canary_count: 2
admitted_correct_patch_rate: 1.0
visible_pass_rate: 1.0
hidden_pass_rate: 1.0
scoped_diff_rate: 1.0
receipt_hash: 5550786e331ee95a821a1f080d2f179627538149e45e8b8f7761526077191b09
```

The prior receipt is intentionally included:

```text
receipts/20260512T172409Z-negative-parser-gate.json
```

That run passed visible and hidden probes, but the admission gate rejected both rows because the benchmark normalized `git status` incorrectly. The corrected run records that harness fix.

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

Scale this into a comparative benchmark:

```text
A. direct Codex
B. REPL packet harness, fanout 1
C. REPL packet harness, fanout 4
D. REPL packet harness, fanout 8
```

Compare admitted correct patches per unit cost.
