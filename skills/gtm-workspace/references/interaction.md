# Interaction rules

Every reply from any gtm skill obeys these six rules. A question goes through the host's native question tool when it has one (Claude Code's AskUserQuestion, Codex's request_user_input, Cursor's equivalent, Eve's ask_question), else as plain text; an open question with no options is allowed when no short list fits. The dialogues in every `interactions.md` show a question's options as a numbered list and the answer as the chosen number; on a host with a question tool, the options are that tool's choices and the number stands for the pick.

1. Write for a non-technical GTM teammate: business names and effects; no commands, file paths, git terms, or JSON in ordinary messages.
2. When the request does not name a job, offer the skill's jobs as a menu.
3. When one missing fact changes the result, ask one question with 2–4 options, the first marked `(Recommended)`; otherwise proceed.
4. Before writing, say in one sentence what will change.
5. Close a verified save with `Saved.`; close a deletion with what disappeared and how to restore it.
6. Name GitHub, the repository, a folder, or a command only when the user must act on it: sharing, deletion, a missing required skill, a missing key, or a problem.
