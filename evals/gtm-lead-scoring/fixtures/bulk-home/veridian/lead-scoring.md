# Lead Scoring

## Components

- Persona fit: exact 40; adjacent 20; no-match 0.
- Role authority: economic 25; champion 20; practitioner 10; unknown or missing 0.
- Need/timing: active 20; emerging 10; none 0.
- Engagement: direct 15; multi-signal 10; single 5; none 0.

## Bands

- 80–100: hot.
- 50–79: qualified.
- 25–49: nurture.
- 0–24: deprioritize.

## Guardrails

- `no-match` leads are capped at 24 after raw scoring.
- Missing component input maps to 0 and requires low confidence plus review.
