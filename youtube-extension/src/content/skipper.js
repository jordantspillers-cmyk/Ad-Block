// Extension-side content script on YouTube pages. It:
//  - hides display ads (banners, feed/search/sidebar ads) with CSS,
//  - mutes, fast-forwards and skips any video ad that still gets through,
//  - hides YouTube's "ad blockers are not allowed" popup,
//  - forwards ad counts to the background so the popup can show them.
(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    pruneAds: true,
    autoSkip: true,
    hideDisplayAds: true,
    blockAdRequests: true,
    hideAntiAdblock: true,
  };
  let settings = { ...DEFAULTS };

  const DISPLAY_AD_CSS = `
    #masthead-ad,
    #player-ads,
    #panels ytd-ads-engagement-panel-content-renderer,
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-display-ad-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-sparkles-text-search-renderer,
    ytd-promoted-video-renderer,
    ytd-search-pyv-renderer,
    ytd-banner-promo-renderer,
    ytd-statement-banner-renderer,
    ytd-primetime-promo-renderer,
    ytd-companion-slot-renderer,
    ytd-action-companion-ad-renderer,
    ytd-player-legacy-desktop-watch-ads-renderer,
    ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
    ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer),
    ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
    ytd-reel-video-renderer:has(.ytd-ad-slot-renderer),
    ytm-promoted-sparkles-web-renderer,
    ytm-companion-ad-renderer,
    ad-slot-renderer,
    .ytp-ad-overlay-container,
    .ytp-ad-overlay-slot,
    .ytp-ad-image-overlay,
    .ytp-featured-product,
    .video-ads.ytp-ad-module:empty {
      display: none !important;
    }`;

  const ANTI_ADBLOCK_CSS = `
    ytd-enforcement-message-view-model,
    tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
    ytd-popup-container:has(ytd-enforcement-message-view-model) tp-yt-iron-overlay-backdrop {
      display: none !important;
    }`;

  const SKIP_BUTTONS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-overlay-close-button',
  ].join(',');

  // ---- messaging (counts only, never page content) ----
  function sendStat(key) {
    try {
      chrome.runtime.sendMessage({ type: 'stat', key, n: 1 }).catch(() => {});
    } catch (_) { /* extension was reloaded; this tab will pick up the new one on refresh */ }
  }
  document.addEventListener('tubeshield:pruned', () => sendStat('adsPruned'));

  // ---- cosmetic CSS ----
  function setStyle(id, css, on) {
    let el = document.getElementById(id);
    if (on && !el) {
      el = document.createElement('style');
      el.id = id;
      el.textContent = css;
      (document.head || document.documentElement).appendChild(el);
    } else if (!on && el) {
      el.remove();
    }
  }

  function applyCosmetics() {
    if (!document.documentElement) return;
    setStyle('tubeshield-display-ads', DISPLAY_AD_CSS, settings.enabled && settings.hideDisplayAds);
    setStyle('tubeshield-anti-adblock', ANTI_ADBLOCK_CSS, settings.enabled && settings.hideAntiAdblock);
  }

  // ---- video ad skipper ----
  let adActive = false;
  let saved = null;

  function findPlayer() {
    return document.querySelector('#movie_player, .html5-video-player');
  }

  function isAdShowing(player) {
    return !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
  }

  function endAd(video) {
    adActive = false;
    if (video && saved) {
      video.muted = saved.muted;
      if (video.playbackRate === 16) video.playbackRate = saved.rate;
    }
    saved = null;
  }

  function tick() {
    const player = findPlayer();
    const video = player && player.querySelector('video');
    const skipping = settings.enabled && settings.autoSkip;

    if (skipping && video && isAdShowing(player)) {
      if (!adActive) {
        adActive = true;
        saved = { muted: video.muted, rate: video.playbackRate === 16 ? 1 : video.playbackRate };
        sendStat('adsSkipped');
      }
      video.muted = true;
      video.playbackRate = 16;
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.25) {
        video.currentTime = video.duration;
      }
      for (const btn of document.querySelectorAll(SKIP_BUTTONS)) btn.click();
    } else if (adActive) {
      endAd(video);
    }

    if (settings.enabled && settings.hideAntiAdblock) dismissAntiAdblock(video);
  }

  // The popup itself is hidden by CSS; it also pauses the video, so resume
  // playback once per popup (not on every tick, so a manual pause sticks).
  const handledNags = new WeakSet();
  function dismissAntiAdblock(video) {
    const nag = document.querySelector('ytd-enforcement-message-view-model');
    if (!nag || handledNags.has(nag)) return;
    handledNags.add(nag);
    if (video && video.paused && !isAdShowing(findPlayer())) video.play().catch(() => {});
  }

  // React the instant the player switches into ad mode, plus a light poll as a
  // safety net (the player element is replaced on some navigations).
  let observedPlayer = null;
  const playerObserver = new MutationObserver(tick);
  function watchPlayer() {
    const player = findPlayer();
    if (player && player !== observedPlayer) {
      playerObserver.disconnect();
      playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
      observedPlayer = player;
    }
    tick();
  }
  setInterval(watchPlayer, 500);

  // ---- settings ----
  function onSettings(next) {
    settings = { ...DEFAULTS, ...(next || {}) };
    applyCosmetics();
    tick();
  }

  chrome.storage.local.get('settings').then(({ settings: s }) => onSettings(s)).catch(() => onSettings());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) onSettings(changes.settings.newValue);
  });

  // Cosmetics need <head>; re-apply once it exists.
  document.addEventListener('DOMContentLoaded', applyCosmetics, { once: true });
})();
