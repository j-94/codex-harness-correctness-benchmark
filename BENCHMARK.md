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

For the larger Codex harness, this means `codex-clean` and Agent OS / UTIR have
separate jobs:

```text
codex-clean = boot/recovery/claim-boundary surface
Agent OS / TP = live control carrier
UTIR op tape = typed execution plan
filesystem/shell/git = backend materializers
receipt = carry-forward state
```

The benchmark should measure that separation. A run should not count as
"harness controlled" merely because the prompt asked Codex to be careful. It
counts only when the receipt shows a typed packet or equivalent op tape, the
selected backend effects, and the gate fields that made the effects admissible.

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

For future claim lanes, keep the same paired design:

```text
same_model
same_task
same_budget
same_allowed_backends
direct_mode
controlled_mode
same_external_scorer
```

The controlled mode may use recovered state, learned routes, compact packets,
UTIR op tapes, and gates. The direct mode may use only the ordinary task prompt
and the same backend budget. This prevents a claim from being upgraded just
because the controlled path had more context, tools, or time.

## Claim-Lane Matrix

Use separate task batches for each capability claim:

| Lane | Direct baseline | Controlled path | Primary score |
| --- | --- | --- | --- |
| Retrieval learned tensors | model chooses retrieval from prompt | tensor route selects surface before answer | route accuracy, evidence-handle accuracy |
| Long context | model receives long context | compact packet plus selected receipts | preserved-action score per token |
| Patch planning | freeform plan | patch-card / op tape | right-file targeting, rollback, tests |
| Effect safety | direct write/tool request | gate/admission/hold | unsafe-admit block rate |
| Claim calibration | normal answer | answer-card with boundary | overclaim rate |
| Memory carry | chat context | receipt-chain recovery | next-turn state recovery |
| Cognitive debt | accept generated output | teach-back / explanation gate | explanation accuracy |
| Tool routing | model chooses tools freely | typed route/control packet | wrong-surface rate |
| Compression | raw transcript | compact state packet | preserved next action |
| Execution | direct patch/run | op tape -> gate -> executor | admitted result rate |

Promotion rule:

```text
claim_supported =
  paired_same_model
  && controlled_score >= direct_score
  && receipt_has_failures
  && receipt_has_cost
  && receipt_has_claim_boundary
```

If any field is missing, the result remains hypothesis or canary only.

## VM-First File Generation

Task files are generated through an in-process VM overlay before they touch disk:

```text
task spec
-> VM write(path, content)
-> VM snapshot hash
-> materialize snapshot to disposable repo
-> run probes on materialized backend
```

Receipts carry the VM identity:

```json
{
  "vm_snapshot_hash": "...",
  "materialization_hash": "...",
  "generated_files": []
}
```

Disk is the execution backend. The VM snapshot is the generation source.

## Why This Benchmark Exists

The long-term benchmark should test broad Codex correctness, but the first step is a reproducible harness loop with strict evidence:

```text
task -> proposer -> probes -> gate -> receipt
```

This benchmark is intentionally small so that failures in the harness itself are easy to see.
