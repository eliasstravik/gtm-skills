# Account Scoring

Score account fit and timing from 1 to 100.

## Fit Labels

- `1-49`: `not-a-fit`
- `50-74`: `good-fit`
- `75-89`: `great-fit`
- `90-100`: `excellent-fit`

## Account Scoring Model

- ICP segment fit: 40 points.
- Warehouse operations pain or timing signal: 25 points.
- Evidence quality and source directness: 15 points.
- Reachable operations or technology buyer: 10 points.
- Disqualifier absence: 10 points.

If `segment_label` is `no-match`, return `not-a-fit` and cap score at 49.
