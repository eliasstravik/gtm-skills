# EMEA Lead Scoring

## Components

- Persona fit: exact 25; adjacent 10; no-match 0.
- Role authority: economic 20; champion 25; practitioner 10; unknown or missing 0.
- Need/timing: active 35; emerging 15; none 0.
- Engagement: direct 20; multi-signal 10; single 5; none 0.

## Bands

- 85–100: immediate.
- 60–84: priority.
- 35–59: nurture.
- 0–34: low.

## Guardrails

- `no-match` leads are capped at 19.
- Missing component input maps to 0 and requires low confidence plus review.
