// The selected GTM Slack feature set. Shared by setup, configuration, and Doctor.
export const REQUIRED_EVENTS = ["app_mention", "message.channels", "message.groups", "message.im", "message.mpim"];
export const REQUIRED_SCOPES = ["app_mentions:read", "channels:history", "channels:read", "chat:write", "groups:history", "groups:read", "im:history", "im:read", "im:write", "mpim:history", "mpim:read", "files:read", "files:write", "chat:write.public"];
export const triggerUrl = id => `https://connect.vercel.com/trigger/${id}`;
export const connectorUrl = (team, id) => `https://vercel.com/${team}/~/connect/${id}`;
const same = (actual = [], wanted = []) => actual.length === wanted.length && wanted.every(x => actual.includes(x));
export function connectorPatch(c) {
  const data = {};
  if (!same(c.data?.botScopes, REQUIRED_SCOPES)) data.botScopes = REQUIRED_SCOPES;
  if (c.data?.userScopes?.length) data.userScopes = [];
  if (c.data?.slashCommands?.length) data.slashCommands = [];
  if (c.data?.shortcuts?.length) data.shortcuts = [];
  return { ...(Object.keys(data).length && { data }), ...(!same(c.events, REQUIRED_EVENTS) && { events: REQUIRED_EVENTS }), ...(!c.triggers?.enabled && { triggers: true }) };
}
export function manifestForConnector(source, connector) {
  const m = structuredClone(source);
  if (!m.display_information || !m.oauth_config || !m.settings) throw new Error("Supply a Slack App Manifest JSON export.");
  m.oauth_config.scopes = { bot: [...REQUIRED_SCOPES] };
  m.settings.event_subscriptions = { ...m.settings.event_subscriptions, request_url: triggerUrl(connector.id), bot_events: [...REQUIRED_EVENTS], user_events: [] };
  m.settings.interactivity = { ...m.settings.interactivity, is_enabled: true, request_url: triggerUrl(connector.id) };
  if (m.features) { delete m.features.agent_view; delete m.features.slash_commands; delete m.features.shortcuts; }
  return m;
}
export function manifestIssues(m, connector) {
  if (!m) return ["Slack-side configuration has not been verified; supply a fresh --slack-manifest JSON export."];
  const issues = [];
  if (!same(m.oauth_config?.scopes?.bot, REQUIRED_SCOPES)) issues.push("Slack bot scopes differ from the selected 14 scopes.");
  if (m.oauth_config?.scopes?.user?.length) issues.push("Slack user scopes are enabled.");
  if (!same(m.settings?.event_subscriptions?.bot_events, REQUIRED_EVENTS)) issues.push("Slack event subscriptions differ from the selected five events.");
  if (m.settings?.event_subscriptions?.request_url !== triggerUrl(connector.id)) issues.push("Slack events point at the wrong connector.");
  if (!m.settings?.interactivity?.is_enabled || m.settings.interactivity.request_url !== triggerUrl(connector.id)) issues.push("Slack interactivity is disabled or points at the wrong connector.");
  if (m.features?.agent_view || m.features?.slash_commands?.length || m.features?.shortcuts?.length || m.settings?.event_subscriptions?.user_events?.length) issues.push("Excluded assistant features, commands, shortcuts, or user events are enabled.");
  return issues;
}
export function installationIsCurrent(connector, installations) {
  const current = installations?.find(i => i.installationId === connector.defaultInstallationId);
  return !!current && Math.max(current.createdAt ?? 0, current.updatedAt ?? 0) >= (connector.reinstallAt ?? 0);
}
