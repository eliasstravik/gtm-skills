import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_EVENTS, REQUIRED_SCOPES, connectorPatch, manifestForConnector, manifestIssues, installationIsCurrent } from '../scripts/slack-config.mjs';
const c = { id: 'scl_test', defaultInstallationId: 'T123', reinstallAt: 200, data: { botScopes: REQUIRED_SCOPES, userScopes: [] }, events: REQUIRED_EVENTS, triggers: { enabled: true } };
const before = { display_information: { name: 'Keep me' }, oauth_config: { redirect_urls: ['https://callback'], scopes: { bot: ['chat:write'], user: ['search:read'] } }, features: { agent_view: {}, shortcuts: [{}], app_home: { messages_tab_enabled: true } }, settings: { token_rotation_enabled: true, event_subscriptions: { bot_events: ['app_mention'] } } };
test('profile update is idempotent and includes the previously unchecked scopes/events', () => {
  assert.deepEqual(connectorPatch(c), {});
  const patch = connectorPatch({ ...c, data: { botScopes: ['chat:write'], userScopes: ['search:read'] }, events: ['app_mention'] });
  assert.ok(patch.data.botScopes.includes('files:write'));
  assert.ok(patch.data.botScopes.includes('mpim:read'));
  assert.ok(patch.events.includes('message.mpim'));
  assert.deepEqual(patch.data.userScopes, []);
});
test('provider manifest preserves identity and unrelated settings while synchronizing all features', () => {
  const m = manifestForConnector(before, c);
  assert.equal(m.display_information.name, 'Keep me');
  assert.deepEqual(m.oauth_config.redirect_urls, ['https://callback']);
  assert.equal(m.settings.token_rotation_enabled, true);
  assert.deepEqual(manifestIssues(m, c), []);
  assert.ok(manifestIssues(before, c).length > 0);
  assert.ok(manifestIssues(m, { ...c, id: 'another' }).length > 0);
  assert.ok(manifestIssues(undefined, c).length > 0);
  assert.ok(before.features.agent_view); // does not mutate the export
});
test('configured permissions do not imply a fresh approved installation', () => {
  assert.equal(installationIsCurrent(c, []), false);
  assert.equal(installationIsCurrent(c, [{ installationId: 'T123', createdAt: 100 }]), false);
  assert.equal(installationIsCurrent(c, [{ installationId: 'T123', createdAt: 100, updatedAt: 201 }]), true);
  assert.equal(installationIsCurrent(c, [{ installationId: 'TOTHER', createdAt: 300 }]), false);
});
