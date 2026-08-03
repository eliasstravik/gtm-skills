Working position: `/Users/eliasstravik/dev/gtmskills-omni/skills/gtm-account-research-workspace/iteration-3/eval-1-one-off-conflicting-headcounts/without_skill/run-1/outputs/signalforge` (root of the copied Signalforge GTM context repo).

## Helix Metals — one-off account brief

**Domain:** `helixmetals.example`  
**Segment label:** `industrial-analytics-teams`  
**Qualification:** Qualified

Helix Metals is a multi-site industrial manufacturer with an internal operations analytics team, Snowflake, and an active plant-performance standardization program. These signals align directly with Signalforge’s plant analytics and multi-site standardization offering.

**Fit evidence**

- Helix reports four factories in Sweden and Germany, exceeding the segment’s three-site threshold.
- Helix reports 1,850 employees; the registry records 1,620. Both figures fall within the 500–5,000 employee profile, but the discrepancy should remain visible.
- Its operations group has an internal analytics team and uses Snowflake.
- Its plant-performance standardization program began in May 2026.
- Likely buying context: operations leaders need comparable performance evidence across its factories.

**Sales-team claims requiring validation**

- “2,100 employees” conflicts with both supplied sources and is unsupported.
- “Runs a Siemens data stack” is unsupported by the supplied sources. The documented platform is Snowflake.

### Metadata

```yaml
account_name: Helix Metals
legal_entity: Helix Metals AB
domain: helixmetals.example
segment_label: industrial-analytics-teams
research_type: one-off
research_status: complete
qualification: qualified
industry: industrial components manufacturing
employee_count:
  reported_by_company: 1850
  registry_recorded: 1620
  sales_claim: 2100
  selected_for_fit_assessment: 1850
  conflict_status: conflicting
site_count: 4
site_locations:
  - Sweden
  - Germany
analytics_model: internal operations analytics team
documented_data_stack:
  - Snowflake
standardization_initiative:
  name: plant-performance standardization program
  start_date: 2026-05
fit_signals:
  - internal operations analytics
  - cloud data warehouse containing plant data
  - active multi-site performance standardization
disqualifiers_observed: []
buying_context: Operations leaders likely need comparable plant evidence across four factories.
unsupported_sales_claims:
  - Helix has 2100 employees
  - Helix runs a Siemens data stack
sources:
  - title: Helix Metals Company Profile
    publisher: Helix Metals
    snapshot_date: 2026-07-10
    evidence:
      - 1850 employees
      - four factories in Sweden and Germany
      - internal analytics team
      - Snowflake
      - standardization program began May 2026
  - title: Nordic Industrial Registry Snapshot
    publisher: Nordic Industrial Registry
    snapshot_date: 2026-06-30
    evidence:
      - 1620 employees
      - four manufacturing sites
      - industrial components manufacturing
```
