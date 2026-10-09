import { DEFAULT_STATS, getSettings, getStats } from './shared/settings.js';

const PRUNE_SCRIPT_ID = 'tubeshield-prune';
const YT_MATCHES = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'];

// Apply settings to the parts of the browser the extension controls:
// the network ruleset, the page-level pruning script and the toolbar badge.
async function applySettings() {
  const s = await getSettings();

  const blockRequests = s.enabled && s.blockAdRequests;
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    blockRequests ? { enableRulesetIds: ['ad_rules'] } : { disableRulesetIds: ['ad_rules'] }
  );

  // The pruning script has to run in the page's own JavaScript world, before
  // YouTube's scripts, so it is registered here instead of in the manifest.
  // That way switching it off really removes it.
  const wantPrune = s.enabled && s.pruneAds;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [PRUNE_SCRIPT_ID] });
  if (wantPrune && registered.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: PRUNE_SCRIPT_ID,
      js: ['src/content/prune-main.js'],
      matches: YT_MATCHES,
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      persistAcrossSessions: true,
    }]);
  } else if (!wantPrune && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [PRUNE_SCRIPT_ID] });
  }

  await chrome.action.setBadgeText({ text: s.enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
}

// Serialise stat writes so counts from several tabs can't overwrite each other.
let statsQueue = Promise.resolve();
function addStat(key, n) {
  statsQueue = statsQueue.then(async () => {
    const stats = await getStats();
    stats[key] = (stats[key] || 0) + n;
    if (!stats.since) stats.since = new Date().toISOString();
    await chrome.storage.local.set({ stats });
  }).catch((err) => console.error('TubeShield: could not save stats', err));
  return statsQueue;
}

chrome.runtime.onInstalled.addListener(async () => {
  const { stats } = await chrome.storage.local.get('stats');
  if (!stats) {
    await chrome.storage.local.set({ stats: { ...DEFAULT_STATS, since: new Date().toISOString() } });
  }
  await applySettings();
});

chrome.runtime.onStartup.addListener(applySettings);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applySettings();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== 'stat') return;
  if (msg.key !== 'adsSkipped' && msg.key !== 'adsPruned') return;
  const n = Math.max(1, Math.min(50, Math.floor(Number(msg.n) || 1)));
  addStat(msg.key, n);
});
