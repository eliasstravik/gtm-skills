# Acceptance cases

Validate generated workflows with fake source/provider adapters before buying real enrichment. Use the dependency's limited real run only with the user's run authorization. These cases exercise behavior, not matching instruction text.

| Case | Required observation |
| --- | --- |
| Source omitted | Asks where connections/followers come from; does not choose a platform or vendor |
| CSV and services supplied | Uses the supplied choices without asking again; imported rows survive a new conversation and deployment |
| Different service types | Direct source, aggregator person service, direct company service all work through their own adapters; no prescribed vendor or universal credential |
| Provider only has headline employer | Declares reduced section coverage; does not invent employment history |
| Identity ambiguity | Two people sharing a name and two companies sharing a name stay separate or unresolved |
| Current-role semantics | Ended and unknown roles are retained in history but do not trigger current-company enrichment |
| All current roles | More than five current roles survive, including two titles at one employer; company work is deduplicated |
| Multiple roles at one employer | Two role links, one company record, one company lookup |
| Shared employer across chunks | People in separate chunks share one company lookup and can all be reached from its company record |
| Overlapping runs | Atomic ownership or single-flight serialization prevents duplicate paid calls; a pending paid request is reconciled before any retry |
| Partial failure | A failed company keeps the person and links; retry buys only unfinished company work, even when the person is fresh |
| Refresh | Complete accepted role sections replace current links; partial/truncated/null/failed sections preserve accepted values; imports do not advance freshness |
| Budget | Source minimum fees and people/company calls share one cap; a one-person test cannot process the whole source; company work stays within selected people |
| Cancellation | Cancelling orchestration cancels registered phase children; unfinished work stays resumable |
| Data page | People → companies → people stays within the workflow, including pagination and pending enrichment; sections expand into labeled entries; columns can be selected |
| Access | Direct details, searches and exports enforce the same population and shared projection; hidden metadata/raw data stay private; changed policy pauses existing Data grants |
| Resumption and scale | At least 120 people and 120 distinct companies execute each phase once per item, share one budget, and resume without repeating paid work |
| Structured export | JSON preserves arrays/objects; CSV quotes each structured value in one cell; raw evidence requires deliberate owner inclusion |
| Shared consumers | Network and email imports reuse confirmed person/company identities. Freeform model interpretations remain workflow context |
| Bytes out | `tests/run.mjs <workspace>/workflows --only read-budgets` passes against the workspace's runtime, and a local limited run under `GTM_DB_LOG_READS=1` shows no statement shape that lists every column of `gtm.people` or `gtm.companies` |

For skill routing, try the positive source variants above and negative requests for a one-off fit check, fetching followers only, generic email enrichment, and running an unchanged saved workflow. The recipe is selected only for its owned output; unchanged runs go to `gtm-workflow`.
