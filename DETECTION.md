# Detection model

Agent Wingman intervenes only when it sees repetition plus low progress. A single failure, repeated test with changing evidence, or productive edit loop is insufficient.

| Signal | Initial condition | Score |
|---|---:|---:|
| Exact failed action recurrence | Same action and failure 3 times in the recent window | +4 |
| Failure recurrence | Same normalized error family 3 times | +3 |
| Read or research churn | Same resource or query group 4 times | +2 |
| Zero productive delta | 8 relevant operations without a progress marker | +2 |
| High error density | 5 failures in the last 8 operations | +2 |
| Plan repetition | Same completed assistant plan 3 times | +1 |
| Consultation churn | Same consultation 3 times without a successful edit | +2 |
| Successful resolution | Previously failing action succeeds | -5 |
| Meaningful change | Successful edit occurs | -2 |
| New evidence | New resource or outcome appears | -2 |

Scores below 8 remain observational. Scores from 8–10 are intervention-eligible; 11 or higher is high confidence. The default policy permits no more than two interventions per episode and two interventions per 30-minute window, with a five-minute cooldown.

Episode keys and resource identities are ephemeral keyed fingerprints. They are useful only within one process and are not stable analytics identifiers.

## Known limitations

Deterministic signals can miss semantic loops and can over-collapse distinct work when normalized actions are very similar. Assistant-text detection waits for terminal text parts and therefore does not react mid-sentence. The labelled replay corpus and real OpenCode load smoke are gates, not proof that every workflow is correctly classified.
