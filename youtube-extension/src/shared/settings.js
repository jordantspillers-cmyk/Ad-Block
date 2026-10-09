// Settings and stats live only in chrome.storage.local on this computer.
// Nothing here is ever sent over the network.

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,          // master switch
  pruneAds: true,         // strip ad data from YouTube's responses before the player sees it
  autoSkip: true,         // fallback: mute, fast-forward and skip any ad that still plays
  hideDisplayAds: true,   // hide banner, feed, search and sidebar ads
  blockAdRequests: true,  // block ad and ad-tracking network requests
  hideAntiAdblock: true,  // hide the "ad blockers are not allowed" popup
});

export const DEFAULT_STATS = Object.freeze({
  adsSkipped: 0,
  adsPruned: 0,
  since: null,
});

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return { ...DEFAULT_STATS, ...(stats || {}) };
}

// Only known keys with the right types are accepted on import.
export function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (input && typeof input === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof input[key] === 'boolean') out[key] = input[key];
    }
  }
  return out;
}

export function sanitizeStats(input) {
  const out = { ...DEFAULT_STATS };
  if (input && typeof input === 'object') {
    for (const key of ['adsSkipped', 'adsPruned']) {
      const n = Number(input[key]);
      if (Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
    }
    if (typeof input.since === 'string' && !Number.isNaN(Date.parse(input.since))) {
      out.since = input.since;
    }
  }
  return out;
}
