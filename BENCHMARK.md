# Benchmark Spec

## Capability Under Test

The target is not small-function repair alone. The target is whether a coding agent can be wrapped in a harness that improves correctness discipline:

```text
retrieve/select context
-> propose patch
-> run probes
-> reject fake wins
-> admit scoped correct patches
-> preserve resumable receipts
```

## Batchable Harness

The main runner is:

```bash
node scripts/main.js --modes direct,harness --out receipts/local-run.json
```

It runs every selected task against each selected mode, then emits one receipt with rows and aggregate metrics.

## Current Default Batch

The default batch uses two disposable Python repositories.

### Task 1: `normalize_repeated_spaces`

Bug:

```python
def normalize_name(name):
    return name.strip().lower().replace(' ', '-')
```

Expected fix:

```python
def normalize_name(name):
    return '-'.join(name.strip().lower().split())
```

### Task 2: `clamp_upper_bound`

Bug:

```python
def clamp(value, low, high):
    return max(value, low)
```

Expected fix:

```python
def clamp(value, low, high):
    return min(max(value, low), high)
```

## Admission Gate

A row is admitted only when all checks pass:

```json
{
  "visible_before_failed": true,
  "codex_completed": true,
  "visible_after_passed": true,
  "hidden_probe_passed": true,
  "scoped_diff": true,
  "no_test_tamper": true,
  "rollback_present": true,
  "evidence_present": true,
  "claim_boundary_present": true
}
```

## Direct vs Harness Comparison

The benchmark compares:

```text
direct:  plain Codex repair prompt
harness: Codex repair prompt with allowed files, visible probe, rollback, evidence, and claim-boundary constraints
```

Both modes are judged by the same external gate. The harness prompt does not get to self-admit.

## Why This Benchmark Exists

The long-term benchmark should test broad Codex correctness, but the first step is a reproducible harness loop with strict evidence:

```text
task -> proposer -> probes -> gate -> receipt
```

This benchmark is intentionally small so that failures in the harness itself are easy to see.
