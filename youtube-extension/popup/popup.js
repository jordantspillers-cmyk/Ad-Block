import { getSettings, getStats, saveSettings } from '../src/shared/settings.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat();

async function render() {
  const [settings, stats] = await Promise.all([getSettings(), getStats()]);
  $('enabled').checked = settings.enabled;
  document.body.classList.toggle('off', !settings.enabled);
  $('status').textContent = settings.enabled ? 'Protecting YouTube' : 'Paused';
  $('adsPruned').textContent = fmt.format(stats.adsPruned);
  $('adsSkipped').textContent = fmt.format(stats.adsSkipped);
}

$('enabled').addEventListener('change', async (e) => {
  await saveSettings({ enabled: e.target.checked });
  render();
});

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('reload').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id !== undefined) chrome.tabs.reload(tab.id);
  window.close();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.settings)) render();
});

render();
