# Detection model

Agent Wingman intervenes only when it sees repetition plus low progress.

## Signals

| Signal | Initial condition | Score |
|---|---:|---:|
| Exact failed action recurrence | Same action and failure 3 times in last 8 relevant calls | +4 |
| Failure recurrence | Same normalized error 3 times in an action family | +3 |
| Read or research churn | Same resource or query group 4 times in last 12 calls | +2 |
| Zero productive delta | 8 relevant operations without edit, success, new resource, or new outcome | +2 |
| High error density | 5 failures in last 8 relevant calls | +2 |
| Plan repetition | Same planning fingerprint 3 times | +1 |
| Consultation churn | Same consultation 3 times without an edit | +2 |
| Successful resolution | A previously failing action succeeds | -5 |
| Meaningful change | An edit occurs | -2 |
| New evidence | A new resource or outcome appears | -2 |

## Thresholds

- Below 6: observe.
- 6-7: probable struggle, no intervention.
- 8-10: intervention eligible.
- 11 or higher: high confidence.

## Duplicate control

Episode keys combine signal type and fingerprinted action, failure, or resource groups. A rising score for the same episode does not produce duplicate advisories inside the cooldown window.

## Limitations

Deterministic signals can miss subtle loops. They can also misread productive repetition when the normalizer over-collapses distinct work. The replay corpus must grow before this becomes a public default.
