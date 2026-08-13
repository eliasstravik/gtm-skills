### Clay

Author and update through the user's installed Clay CLI, MCP, or skills, discovering current operations from that tooling. Validate draft workflows target-natively before saving their record. When the tooling is unavailable, guide the user through the equivalent Clay UI steps and verify the observed result rather than inventing commands.

Test or pilot the draft through Clay's available test-run or limited-scope surfaces. Estimate credits through Clay's current estimator and balance surfaces before material spend.

Clay edits remain draft until published. Record whether the agent can publish with the available tooling or the user must click Publish; verify the numbered live version afterward. A live workflow continues running its previous logic until the draft is published, including on-demand workflows intended for use outside draft tests.

Inspect workflow state and runs through target-native reads using the saved Clay workflow ID or URL. Workflow definitions, tables, run state, and outputs live in Clay; the workspace stores only the record.

Connections usually live in Clay and are referenced by configured action rather than secret. Store no credential in the workspace; record only the in-app connection label or safe credential pointer and the provider's known billing model.
