// End-to-end check: loads the unpacked extension into Chromium, serves a mock
// YouTube watch page and verifies each blocking layer. Also saves screenshots
// of the popup and settings page to store/ for the Chrome Web Store listing.
// Run: npm run e2e   (needs Playwright + Chromium installed)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(join(process.execPath, '../../lib/node_modules/playwright'));
}
const { chromium } = playwright;

const extDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const userDataDir = mkdtempSync(join(tmpdir(), 'tubeshield-e2e-'));

const MOCK_WATCH_PAGE = `<!doctype html><html><head><title>Mock YouTube</title></head><body>
<div id="masthead-ad">BANNER AD</div>
<ytd-ad-slot-renderer id="feedAd">FEED AD</ytd-ad-slot-renderer>
<div id="normalContent">Video title</div>
<div id="movie_player" class="html5-video-player">
  <video id="v" muted></video>
  <button class="ytp-skip-ad-button" id="skip">Skip</button>
</div>
<script>
  var ytInitialPlayerResponse = {videoDetails:{videoId:'abc'}, adPlacements:[1], playerAds:[2]};
  window.initialHadAds = !!(ytInitialPlayerResponse.adPlacements || ytInitialPlayerResponse.playerAds);
  window.skipClicks = 0;
  document.getElementById('skip').addEventListener('click', () => window.skipClicks++);
  window.adRequest = fetch('https://securepubads.g.doubleclick.net/pagead/ads?x=1')
    .then(() => 'loaded', () => 'blocked');
  window.apiResult = fetch('/youtubei/v1/player').then(r => r.json());
</script></body></html>`;

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium', // full Chromium; the headless shell can't load extensions
  headless: true,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  // The worker object can appear before its chrome.* bindings are ready.
  for (let i = 0; i < 50 && !(await sw.evaluate(() => !!globalThis.chrome?.scripting)); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Wait for onInstalled to register the page-world pruning script.
  await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const s = await chrome.scripting.getRegisteredContentScripts();
      if (s.length) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('prune script never registered');
  });

  await ctx.route('https://www.youtube.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/youtubei/v1/player')) {
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ videoDetails: { videoId: 'xyz' }, adPlacements: [1], adSlots: [2] }) });
    }
    return route.fulfill({ contentType: 'text/html', body: MOCK_WATCH_PAGE });
  });
  await ctx.route('https://securepubads.g.doubleclick.net/**', (route) =>
    route.fulfill({ status: 200, body: 'ad' }));

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('https://www.youtube.com/watch?v=abc');

  // 1. Initial player data pruned
  assert.equal(await page.evaluate(() => window.initialHadAds), false, 'ytInitialPlayerResponse ads removed');
  assert.equal(await page.evaluate(() => ytInitialPlayerResponse.videoDetails.videoId), 'abc');

  // 2. Player API (fetch().json()) pruned
  const api = await page.evaluate(() => window.apiResult);
  assert.deepEqual(api, { videoDetails: { videoId: 'xyz' } }, 'player API ads removed');

  // 3. Ad network request blocked
  assert.equal(await page.evaluate(() => window.adRequest), 'blocked', 'doubleclick blocked');

  // 4. Display ads hidden, normal content visible
  await page.waitForFunction(() => getComputedStyle(document.getElementById('masthead-ad')).display === 'none');
  assert.equal(await page.isVisible('#feedAd'), false);
  assert.equal(await page.isVisible('#normalContent'), true);

  // 5. Auto-skip when the player enters ad mode
  await page.evaluate(() => {
    const v = document.getElementById('v');
    v.muted = false;
    document.getElementById('movie_player').classList.add('ad-showing');
  });
  await page.waitForFunction(() => window.skipClicks > 0, null, { timeout: 3000 });
  const during = await page.evaluate(() => ({ muted: v.muted, rate: v.playbackRate }));
  assert.deepEqual(during, { muted: true, rate: 16 });
  await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
  await page.waitForFunction(() => v.playbackRate === 1 && v.muted === false, null, { timeout: 3000 });

  // 6. Stats recorded locally
  await page.waitForTimeout(300);
  const stats = await sw.evaluate(() => chrome.storage.local.get('stats').then((r) => r.stats));
  assert.ok(stats.adsSkipped >= 1, 'skip counted');
  assert.ok(stats.adsPruned >= 2, 'prunes counted');

  // 7. Master switch off: ads come back after reload
  await sw.evaluate(() => chrome.storage.local.set({ settings: { enabled: false } }));
  await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      if ((await chrome.scripting.getRegisteredContentScripts()).length === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('prune script not unregistered');
  });
  await page.reload();
  assert.equal(await page.evaluate(() => window.initialHadAds), true, 'off means off');
  assert.equal(await page.evaluate(() => window.adRequest), 'loaded');
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#masthead-ad'), true);
  await sw.evaluate(() => chrome.storage.local.set({ settings: { enabled: true } }));

  assert.deepEqual(errors, [], 'no page errors');

  // 8. UI pages render without errors; save store screenshots
  const ui = await ctx.newPage();
  const uiErrors = [];
  ui.on('pageerror', (e) => uiErrors.push(e.message));
  await ui.setViewportSize({ width: 1280, height: 800 });
  await ui.goto(`chrome-extension://${extId}/options/options.html`);
  await ui.waitForSelector('#opt-enabled');
  await ui.waitForFunction(() => document.getElementById('opt-enabled').checked);
  await ui.screenshot({ path: join(extDir, 'store/screenshot-settings-1280x800.png') });
  await ui.goto(`chrome-extension://${extId}/popup/popup.html`);
  await ui.waitForFunction(() => document.getElementById('adsSkipped').textContent !== '0');
  await ui.setViewportSize({ width: 300, height: 240 });
  await ui.screenshot({ path: join(extDir, 'store/popup.png'), fullPage: true });
  assert.deepEqual(uiErrors, [], 'no UI errors');

  console.log('E2E: all checks passed');
} finally {
  await ctx.close();
}
