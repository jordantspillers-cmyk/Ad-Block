import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/content/prune-main.js', import.meta.url), 'utf8');

// Run prune-main.js in a fresh context that looks enough like a page.
function loadPage() {
  const events = [];
  const ctx = vm.createContext({
    document: { dispatchEvent: (e) => events.push(e) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Response: class {
      constructor(body) { this.body = body; }
      json() { return Promise.resolve(JSON.parse(this.body)); }
    },
  });
  ctx.window = ctx;
  vm.runInContext(source, ctx);
  return { ctx, events };
}

const playerResponse = () => ({
  videoDetails: { videoId: 'abc' },
  streamingData: { formats: [1] },
  adPlacements: [{ ad: 1 }],
  playerAds: [{ ad: 2 }],
  adSlots: [{ ad: 3 }],
  adBreakHeartbeatParams: 'x',
});

test('JSON.parse strips ad keys and keeps video data', () => {
  const { ctx, events } = loadPage();
  const out = vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(playerResponse()))})`, ctx);
  assert.deepEqual(Object.keys(out).sort(), ['streamingData', 'videoDetails']);
  assert.equal(out.videoDetails.videoId, 'abc');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tubeshield:pruned');
});

test('nested playerResponse (watch-next / Shorts) is pruned', () => {
  const { ctx } = loadPage();
  const body = JSON.stringify([{ playerResponse: playerResponse() }, { response: {} }]);
  const out = vm.runInContext(`JSON.parse(${JSON.stringify(body)})`, ctx);
  assert.equal(out[0].playerResponse.adPlacements, undefined);
  assert.equal(out[0].playerResponse.videoDetails.videoId, 'abc');
});

test('ordinary JSON is untouched and not reported', () => {
  const { ctx, events } = loadPage();
  const out = vm.runInContext(`JSON.parse('{"a":1,"b":[1,2]}')`, ctx);
  assert.deepEqual({ ...out, b: [...out.b] }, { a: 1, b: [1, 2] });
  assert.equal(vm.runInContext(`JSON.parse('5')`, ctx), 5);
  assert.equal(vm.runInContext(`JSON.parse('null')`, ctx), null);
  assert.equal(events.length, 0);
});

test('ytInitialPlayerResponse set by the page is pruned', () => {
  const { ctx } = loadPage();
  vm.runInContext(`var ytInitialPlayerResponse = ${JSON.stringify(playerResponse())};`, ctx);
  const v = vm.runInContext('window.ytInitialPlayerResponse', ctx);
  assert.equal(v.playerAds, undefined);
  assert.equal(v.videoDetails.videoId, 'abc');
});

test('Response.prototype.json results are pruned', async () => {
  const { ctx } = loadPage();
  const out = await vm.runInContext(`new Response(${JSON.stringify(JSON.stringify(playerResponse()))}).json()`, ctx);
  assert.equal(out.adPlacements, undefined);
  assert.equal(out.videoDetails.videoId, 'abc');
});

test('JSON.parse still throws on bad input and keeps reviver support', () => {
  const { ctx } = loadPage();
  assert.throws(() => vm.runInContext(`JSON.parse('{bad')`, ctx));
  assert.equal(vm.runInContext(`JSON.parse('{"n":2}', (k, v) => k === 'n' ? v * 2 : v).n`, ctx), 4);
});

test('running the script twice installs the hooks once', () => {
  const { ctx } = loadPage();
  const before = vm.runInContext('JSON.parse', ctx);
  vm.runInContext(source, ctx);
  assert.equal(vm.runInContext('JSON.parse', ctx), before);
});
