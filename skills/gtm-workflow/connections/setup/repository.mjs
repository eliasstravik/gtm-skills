import { basename, join, resolve } from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { captured } from "./cli.mjs";
import { inspectionEnvironment } from "../local/inspection-environment.mjs";
import { requireThat } from "../src/errors.mjs";

/** Publish only the exact files created by local scaffold; preserve other work. */
export async function ensureWorkspaceRepository({ workspace, githubOwner, config, journal, run = captured, execute = spawnSync }) {
  workspace = await realpath(workspace);
  const probe = (args) => execute("git", args, { cwd: workspace, env: inspectionEnvironment(process.env), encoding: "utf8", stdio: "pipe" });
  const git = (args) => { const result = probe(args); requireThat(result.status === 0, "workspace_git_operation_failed", 503); return result.stdout.trim(); };
  const root = probe(["rev-parse", "--show-toplevel"]);
  requireThat(root.status !== 0 || resolve(root.stdout.trim()) === resolve(workspace), "workspace_requires_own_repository", 409);
  if (root.status !== 0) git(["init", "--initial-branch=main"]);
  const user = JSON.parse(run("gh", ["api", "user"]));
  let remote = probe(["remote", "get-url", "origin"]);
  if (remote.status !== 0) {
    const owner = githubOwner ?? user.login, name = basename(workspace);
    requireThat(/^[A-Za-z0-9_.-]+$/.test(owner) && /^[a-z0-9][a-z0-9-]{0,79}$/.test(name), "workspace_repository_name_required");
    const fullName = `${owner}/${name}`, prior = await journal.get("workspace_repository");
    requireThat(!prior || prior.repository === fullName, "workspace_repository_binding_changed", 409);
    const existing = spawnSync("gh", ["api", `repos/${fullName}`], { encoding: "utf8", stdio: "pipe" });
    if (existing.status !== 0) {
      requireThat(/HTTP 404/.test(existing.stderr ?? ""), "github_repository_lookup_failed", 503);
      requireThat(!prior, "repository_creation_unresolved", 409);
      await journal.set("workspace_repository", { phase: "create_attempted", repository: fullName });
      try { run("gh", ["repo", "create", fullName, "--private"]); } catch { /* Inspect by the exact repository name below. */ }
    }
    const repository = JSON.parse(run("gh", ["api", `repos/${fullName}`]));
    requireThat(repository.full_name?.toLowerCase() === fullName.toLowerCase() && repository.private === true, "workspace_repository_binding_changed", 409);
    const branches = JSON.parse(run("gh", ["api", `repos/${fullName}/branches?per_page=1`]));
    requireThat(Array.isArray(branches) && branches.length === 0, "clone_existing_workspace_repository", 409);
    git(["remote", "add", "origin", `https://github.com/${fullName}.git`]);
    await journal.set("workspace_repository", { phase: "linked", repository: fullName, repositoryId: repository.id });
    remote = probe(["remote", "get-url", "origin"]);
  }
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote.stdout.trim());
  requireThat(match && (!githubOwner || match[1].toLowerCase() === githubOwner.toLowerCase()), "workspace_repository_required", 409);
  const fullName = `${match[1]}/${match[2]}`;
  const tracked = git(["ls-files", "--", "workflows/package.json"]);
  if (!tracked) {
    requireThat(Array.isArray(config.scaffold) && config.scaffold.length > 0 && probe(["diff", "--cached", "--quiet"]).status === 0, "publish_scaffold_before_setup", 409);
    for (const file of config.scaffold) {
      requireThat(/^workflows\/[A-Za-z0-9_./\[\]-]+$/.test(file.path) && !file.path.split("/").includes("..") && !file.path.includes("/.env"), "invalid_scaffold_manifest", 403);
      requireThat(createHash("sha256").update(await readFile(join(workspace, file.path))).digest("hex") === file.digest, "scaffold_changed_before_publish", 409);
    }
    if (probe(["rev-parse", "--verify", "HEAD"]).status !== 0) git(["symbolic-ref", "HEAD", "refs/heads/main"]);
    git(["add", "--", ...config.scaffold.map((file) => file.path)]);
    git(["-c", "user.name=GTM setup", "-c", `user.email=${user.login}@users.noreply.github.com`, "commit", "-m", "Initialize workflow runtime"]);
    await journal.set("scaffold_commit", { commit: git(["rev-parse", "HEAD"]), repository: fullName });
  }
  const scaffoldCommit = await journal.get("scaffold_commit");
  if (scaffoldCommit && scaffoldCommit.phase !== "published") {
    requireThat(scaffoldCommit.repository === fullName, "workspace_repository_binding_changed", 409);
    // The exact scaffold commit is the only source this bootstrap may publish.
    // A non-fast-forward push fails rather than replacing remote history.
    const remoteHead = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0];
    let alreadyPublished = remoteHead === scaffoldCommit.commit;
    if (remoteHead && !alreadyPublished) {
      git(["fetch", "origin", "main"]);
      alreadyPublished = probe(["merge-base", "--is-ancestor", scaffoldCommit.commit, remoteHead]).status === 0;
      requireThat(alreadyPublished || probe(["merge-base", "--is-ancestor", remoteHead, scaffoldCommit.commit]).status === 0, "publish_scaffold_merge_required", 409);
    }
    if (!alreadyPublished) git(["push", "origin", `${scaffoldCommit.commit}:refs/heads/main`]);
    await journal.set("scaffold_commit", { ...scaffoldCommit, phase: "published" });
  }
  const source = JSON.parse(run("gh", ["api", `repos/${fullName}/contents/workflows/server/api/connections.get.ts`]));
  requireThat(source.type === "file" && typeof source.sha === "string", "upgrade_runtime_before_setup", 409);
  return { owner: match[1], repo: match[2] };
}
