import {
  DEFAULT_SETTINGS, DEFAULT_STATS, getSettings, getStats, saveSettings,
  sanitizeSettings, sanitizeStats,
} from '../src/shared/settings.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat();

const TOGGLES = [
  ['enabled', 'TubeShield on', 'Master switch for everything below.'],
  ['pruneAds', 'Remove video ads before they load', 'Strips ad instructions from the data YouTube sends its player.'],
  ['autoSkip', 'Auto-skip any ad that gets through', 'Mutes it, fast-forwards to the end and presses Skip.'],
  ['hideDisplayAds', 'Hide banner and feed ads', 'Home feed, search, sidebar, overlay and sponsored-product ads.'],
  ['blockAdRequests', 'Block ad and ad-tracking requests', 'Stops YouTube pages from loading ad servers and ad beacons.'],
  ['hideAntiAdblock', 'Hide the "ad blockers not allowed" popup', 'And resume the video it paused.'],
];

function buildToggles() {
  const wrap = $('toggles');
  for (const [key, title, help] of TOGGLES) {
    const row = document.createElement('label');
    row.className = 'row';
    row.dataset.key = key;
    row.innerHTML = `
      <span class="label"><b></b><span></span></span>
      <span class="switch"><input type="checkbox"><span class="track"></span></span>`;
    row.querySelector('b').textContent = title;
    row.querySelector('.label > span').textContent = help;
    const input = row.querySelector('input');
    input.id = `opt-${key}`;
    input.addEventListener('change', () => saveSettings({ [key]: input.checked }).then(render));
    wrap.appendChild(row);
  }
}

async function render() {
  const [settings, stats] = await Promise.all([getSettings(), getStats()]);
  for (const [key] of TOGGLES) {
    const input = $(`opt-${key}`);
    input.checked = settings[key];
    const dependent = key !== 'enabled';
    input.disabled = dependent && !settings.enabled;
    input.closest('.row').classList.toggle('disabled', input.disabled);
  }
  $('adsPruned').textContent = fmt.format(stats.adsPruned);
  $('adsSkipped').textContent = fmt.format(stats.adsSkipped);
  $('since').textContent = stats.since
    ? `Counting since ${new Date(stats.since).toLocaleDateString()}.`
    : '';
}

function say(text, kind = 'ok') {
  const el = $('message');
  el.textContent = text;
  el.className = `small ${kind}`;
}

$('export').addEventListener('click', async () => {
  const data = {
    app: 'TubeShield',
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    stats: await getStats(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tubeshield-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('Exported. The file is in your Downloads folder.');
});

$('import').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'TubeShield') throw new Error('not a TubeShield export');
    await chrome.storage.local.set({
      settings: sanitizeSettings(data.settings),
      stats: sanitizeStats(data.stats),
    });
    say('Imported.');
    render();
  } catch (err) {
    say(`Couldn't import that file: ${err.message}.`, 'err');
  }
});

$('resetStats').addEventListener('click', async () => {
  if (!confirm('Reset both counters to zero?')) return;
  await chrome.storage.local.set({ stats: { ...DEFAULT_STATS, since: new Date().toISOString() } });
  say('Stats reset.');
  render();
});

$('resetAll').addEventListener('click', async () => {
  if (!confirm('Erase all TubeShield data and restore the default settings?')) return;
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS },
    stats: { ...DEFAULT_STATS, since: new Date().toISOString() },
  });
  say('Everything reset to defaults.');
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.settings)) render();
});

$('version').textContent = `v${chrome.runtime.getManifest().version}`;
buildToggles();
render();
