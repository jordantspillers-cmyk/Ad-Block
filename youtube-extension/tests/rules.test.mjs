import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = read('../rules/ad_rules.json');
const manifest = read('../manifest.json');

test('rule ids are unique positive integers', () => {
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(Number.isInteger(id) && id > 0);
});

test('every rule blocks and is scoped to YouTube pages', () => {
  for (const r of rules) {
    assert.equal(r.action.type, 'block');
    assert.deepEqual(r.condition.initiatorDomains, ['youtube.com', 'youtube-nocookie.com']);
    assert.ok(!r.condition.resourceTypes.includes('main_frame'));
  }
});

test('no rule touches video streams or core YouTube APIs', () => {
  const forbidden = ['googlevideo.com', 'ytimg.com', '/youtubei/v1/player', '/youtubei/v1/next', '/youtubei/v1/browse'];
  for (const r of rules) {
    for (const f of forbidden) assert.ok(!r.condition.urlFilter.includes(f), `${r.condition.urlFilter} hits ${f}`);
  }
});

test('manifest ruleset points at the rules file', () => {
  const [rs] = manifest.declarative_net_request.rule_resources;
  assert.equal(rs.path, 'rules/ad_rules.json');
  assert.equal(rs.id, 'ad_rules');
});
