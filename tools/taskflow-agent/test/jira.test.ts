import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import { buildJiraAuthHeader, buildJiraMcpServerConfig, intakePreamble, JIRA_MCP_URL, redactJiraSecrets } from '../src/jira.js';
import { JIRA_READ_TOOL_NAMES } from '../src/policy.js';

describe('buildJiraAuthHeader', () => {
  test('round-trips email:token through base64', () => {
    const header = buildJiraAuthHeader({ email: 'dev@example.com', apiToken: 'sekret-123' });
    assert.match(header, /^Basic /);
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    assert.equal(decoded, 'dev@example.com:sekret-123');
  });
});

describe('buildJiraMcpServerConfig', () => {
  test('shape: url, auth header, and exactly the permitted read tools', () => {
    const config = buildJiraMcpServerConfig({ email: 'dev@example.com', apiToken: 'sekret-123' });
    assert.equal(config.type, 'http');
    assert.equal(config.url, JIRA_MCP_URL);
    assert.equal(config.headers?.['Authorization'], buildJiraAuthHeader({ email: 'dev@example.com', apiToken: 'sekret-123' }));
    assert.equal(config.tools?.length, JIRA_READ_TOOL_NAMES.length);
    for (const tool of config.tools ?? []) {
      assert.ok(JIRA_READ_TOOL_NAMES.includes(tool.name), `${tool.name} should be one of the permitted read tools`);
      assert.equal(tool.permission_policy, 'always_allow');
    }
  });
});

describe('intakePreamble', () => {
  test('names the ticket and states the key boundaries', () => {
    const preamble = intakePreamble('/tmp/worktree', 'TASK-123');
    assert.match(preamble, /TASK-123/);
    assert.match(preamble, /untrusted/);
    assert.match(preamble, /ticket-brief\.proposed\.md/);
    assert.match(preamble, /ExitPlanMode/);
    assert.match(preamble, /Confluence/);
  });
});

describe('redactJiraSecrets', () => {
  const ORIGINAL_EMAIL = process.env['JIRA_EMAIL'];
  const ORIGINAL_TOKEN = process.env['JIRA_API_TOKEN'];

  before(() => {
    process.env['JIRA_EMAIL'] = 'dev@example.com';
    process.env['JIRA_API_TOKEN'] = 'sekret-123';
  });

  after(() => {
    if (ORIGINAL_EMAIL === undefined) delete process.env['JIRA_EMAIL'];
    else process.env['JIRA_EMAIL'] = ORIGINAL_EMAIL;
    if (ORIGINAL_TOKEN === undefined) delete process.env['JIRA_API_TOKEN'];
    else process.env['JIRA_API_TOKEN'] = ORIGINAL_TOKEN;
  });

  test('strips a raw token appearing in error text', () => {
    const redacted = redactJiraSecrets('request failed: invalid credential sekret-123 was rejected');
    assert.doesNotMatch(redacted, /sekret-123/);
    assert.match(redacted, /\[REDACTED\]/);
  });

  test('strips the full Basic auth header value too', () => {
    const header = buildJiraAuthHeader({ email: 'dev@example.com', apiToken: 'sekret-123' });
    const redacted = redactJiraSecrets(`headers were: { Authorization: '${header}' }`);
    assert.doesNotMatch(redacted, /sekret-123/);
    assert.doesNotMatch(redacted, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('is a no-op when there is nothing to redact', () => {
    assert.equal(redactJiraSecrets('a perfectly ordinary error'), 'a perfectly ordinary error');
  });

  test('is a no-op when JIRA_API_TOKEN is not set', () => {
    delete process.env['JIRA_API_TOKEN'];
    assert.equal(redactJiraSecrets('token sekret-123 not present here'), 'token sekret-123 not present here');
    process.env['JIRA_API_TOKEN'] = 'sekret-123';
  });
});
