# Lead Scoring

Score lead fit and outreach timing from 1 to 100.

## Fit Labels

- `1-49`: `not-a-fit`
- `50-74`: `good-fit`
- `75-89`: `great-fit`
- `90-100`: `excellent-fit`

## Lead Scoring Model

- Persona fit: 35 points.
- Buying influence: 20 points.
- Pain proximity or timing signal: 20 points.
- Account fit: 15 points.
- Evidence quality: 10 points.

If `persona_label` is `no-match`, return `not-a-fit` and cap score at 49.
