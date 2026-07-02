# ADR 0003: Use `~/.gtm/registry.json` as the GTM Home Registry

## Status

Accepted

## Context

GTM Skills need a way to find the active GTM Context Project and list available context projects under `~/.gtm`. A single `.current` pointer would only identify the active project and would not provide enough metadata for later project selection, onboarding, recommendations, syncing, or maintenance.

The root metadata file needs to be machine-readable and stable enough for skills to update safely.

## Decision

Use `~/.gtm/registry.json` as the canonical GTM Home Registry. It is local state outside any shared GTM Context Project git repository.

Initial shape:

```json
{
  "version": 1,
  "activeProject": "google",
  "projects": {
    "google": {
      "path": "~/.gtm/google",
      "displayName": "Google",
      "aliases": ["goog"],
      "createdAt": "2026-06-30T00:00:00Z",
      "lastUsedAt": "2026-06-30T00:00:00Z",
      "lastUpdatedAt": "2026-06-30T00:00:00Z",
      "local": {
        "activePerson": "jane-doe-acme-com",
        "activeWorkspace": "default",
        "lastUsedAt": "2026-06-30T00:00:00Z"
      }
    }
  }
}
```

The registry can later grow to include default role, default company type, installed bundles, remote sync information, or team-sharing metadata. User-specific active selections belong here, not in committed project files such as `gtm.yaml`.

## Consequences

- Skills can select the active project without a separate `.current` file.
- Skills can present project choices when the user works across multiple companies or clients.
- Project metadata can support future onboarding and skill recommendation flows.
- Skills that update the registry must preserve unknown fields so future versions remain backward-compatible.
