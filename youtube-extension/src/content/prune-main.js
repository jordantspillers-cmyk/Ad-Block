// Runs inside YouTube's own page context at document_start, before YouTube's
// scripts. It removes the ad instructions from the data YouTube hands its
// video player, so the player never schedules the ads in the first place.
// This file cannot use chrome.* APIs; it reports counts through a DOM event
// that skipper.js (the extension-side script) forwards to the background.
(() => {
  'use strict';
  if (window.__tubeShieldPrune) return;
  Object.defineProperty(window, '__tubeShieldPrune', { value: true });

  // Keys YouTube uses to tell the player when and which ads to show.
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];

  function pruneObject(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 3) return 0;
    let removed = 0;
    if (Array.isArray(obj)) {
      for (const item of obj) removed += pruneObject(item, depth + 1);
      return removed;
    }
    for (const key of AD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        delete obj[key];
        removed++;
      }
    }
    // Player data is nested one level down in watch-next and Shorts responses.
    if (obj.playerResponse) removed += pruneObject(obj.playerResponse, depth + 1);
    return removed;
  }

  function report(removed) {
    if (removed > 0) {
      try {
        document.dispatchEvent(new CustomEvent('tubeshield:pruned', { detail: 1 }));
      } catch (_) { /* reporting is best effort */ }
    }
  }

  function prune(value) {
    if (value && typeof value === 'object') report(pruneObject(value, 0));
    return value;
  }

  // 1. Data parsed from text, including responses YouTube reads with .text().
  const nativeParse = JSON.parse;
  JSON.parse = new Proxy(nativeParse, {
    apply(target, thisArg, args) {
      return prune(Reflect.apply(target, thisArg, args));
    },
  });

  // 2. fetch() responses read with .json() (the player and Shorts APIs).
  if (typeof Response !== 'undefined' && Response.prototype.json) {
    const nativeJson = Response.prototype.json;
    Response.prototype.json = new Proxy(nativeJson, {
      apply(target, thisArg, args) {
        return Reflect.apply(target, thisArg, args).then(prune);
      },
    });
  }

  // 3. The player data embedded in the HTML of a watch page on first load.
  let initialPlayerResponse;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get() { return initialPlayerResponse; },
      set(value) { initialPlayerResponse = prune(value); },
    });
  } catch (_) { /* already defined by the page; the hooks above still apply */ }
})();
