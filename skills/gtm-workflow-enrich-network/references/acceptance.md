# Acceptance cases

Validate generated workflows with fake source/provider adapters before buying real enrichment. Use the dependency's limited real run only with the user's run authorization. These cases exercise behavior, not matching instruction text.

| Case | Required observation |
| --- | --- |
| Source omitted | Asks where connections/followers come from; does not choose a platform or vendor |
| CSV and services supplied | Uses the supplied choices without asking again; imported rows survive a new conversation and deployment |
| Different service types | Direct source, aggregator person service, direct company service all work through their own adapters; no prescribed vendor or universal credential |
| Provider only has headline employer | Explains reduced coverage before execution; does not claim to have checked five current experiences |
| Identity ambiguity | Two people sharing a name and two companies sharing a name stay separate or unresolved |
| Current-role semantics | Ended and unknown roles are retained in history but do not trigger current-company enrichment |
| Limit and ordering | Seven current experiences select five by the documented ordering; omitted count is two; changing the limit to three reuses person data |
| Multiple roles at one employer | Two role links, one company record, one company lookup |
| Shared employer across chunks | People in separate chunks share one company lookup and can all be reached from its company record |
| Overlapping runs | Atomic ownership or single-flight serialization prevents duplicate paid calls; a pending paid request is reconciled before any retry |
| Partial failure | A failed company keeps the person and links; retry buys only unfinished company work, even when the person is fresh |
| Refresh | A successful job change updates only that person's selected links; a failed refresh preserves last successful data and marks it stale |
| Budget | Source minimum fees and people/company calls share one cap; a one-person test cannot process the whole source; company work stays within selected people |
| Cancellation | Cancelling orchestration cancels registered phase children; unfinished work stays resumable |
| Data page | People → companies → people works, including pagination, empty results, and missing enrichment; raw blobs are not displayed |
| Access | A diagram token cannot read data; a data token cannot cross workflows; unregistered tables and malformed inputs cannot be queried |

For skill routing, try the positive source variants above and negative requests for a one-off fit check, fetching followers only, generic email enrichment, and running an unchanged saved workflow. The recipe is selected only for its owned output; unchanged runs go to `gtm-workflow`.
