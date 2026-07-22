# Global Lead Scoring

## Components

- Persona fit: exact 30; adjacent 15; no-match 0.
- Role authority: economic 30; champion 20; practitioner 10; unknown or missing 0.
- Need/timing: active 25; emerging 10; none 0.
- Engagement: direct 15; multi-signal 10; single 5; none 0.

## Bands

- 80–100: global-hot.
- 50–79: global-qualified.
- 0–49: global-low.

## Guardrails

- `no-match` leads are capped at 24.
- Missing input maps to 0 and requires review.
