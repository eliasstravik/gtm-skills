# No-skill failures — round 1

Fresh `gpt-5.6-luna` runs with all skills forbidden.

## F1 — workflow metadata was absent

None of the three flows emitted the exact state-derived working line, a complete
root-to-target persona source report, or final project/org/mode/source and
side-effect metadata.

## F2 — a non-decisive unknown inflated review

The one-off result correctly matched Alex to Revenue Operations Leader with high
confidence, but set `needs_review: true` only because executive sponsorship and
budget authority were unknown. Those questions do not affect the persona label:
the supplied internal ownership and responsibilities are decisive.

## F3 — output shape was not deterministic

One-off runs varied among JSON, loose key/value prose, and a field set where the
explicit qualified label could be absent even though matched persona was shown.
The durable contract needs a stable visible field set.
