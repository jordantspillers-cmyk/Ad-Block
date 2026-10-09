# TubeShield: private YouTube ad blocker for Chrome

A Chrome extension (Manifest V3) that removes YouTube ads and keeps your data on
your computer. No servers, no accounts, no analytics, no remote code.

> The Pi-hole setup in the rest of this repo blocks ads for your whole network,
> but it **can't** block YouTube ads: YouTube serves ads from the same servers
> as the videos. That's why TubeShield works inside the browser instead.

## What it does

TubeShield blocks ads in four layers, each with its own switch in Settings:

| Layer | How it works |
| --- | --- |
| **Remove video ads before they load** | Runs before YouTube's own scripts and deletes the ad instructions (`adPlacements`, `adSlots`, `playerAds`) from the data YouTube sends its video player, so the player never schedules the ads. |
| **Auto-skip** | If an ad still plays, it mutes the ad, jumps to its end at 16× speed and presses Skip. Your volume and speed are restored afterwards. |
| **Hide banner and feed ads** | Hides home-feed, search, sidebar, masthead, overlay and sponsored-product ads with CSS. |
| **Block ad requests** | Chrome's built-in blocker stops YouTube pages from contacting ad servers (DoubleClick, Google Ad Services) and ad-tracking beacons. |

It also hides YouTube's "ad blockers are not allowed" popup and resumes the
video it paused.

## Your data

- Everything is stored with `chrome.storage.local`, on this computer only. It isn't synced to your Google account.
- Stored data: six on/off settings and two counters (ads removed, ads skipped).
- The extension makes **no network requests of its own**.
- **Settings → Your data** has buttons to export your data as a JSON file, import it on another computer, reset the counters, or erase everything.
- It only runs on `youtube.com` and `youtube-nocookie.com`.

Full policy: [PRIVACY.md](PRIVACY.md).

## Install it for yourself (2 minutes, free)

1. Download this repository (green **Code** button → **Download ZIP**) and unzip it,
   or download `dist/tubeshield-1.0.0.zip` and unzip that.
2. Open Chrome and go to `chrome://extensions`.
3. Switch on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `youtube-extension` folder (or the folder you unzipped the `.zip` into, the one containing `manifest.json`).
5. Click the puzzle-piece icon in Chrome's toolbar and pin **TubeShield**.
6. Reload any YouTube tabs you already had open.

You own this copy. Nobody can push updates to it or change it but you.

## Publish it on the Chrome Web Store

Do this if you want it installable with one click on every computer, with automatic updates.

1. Register as a Chrome Web Store developer at
   <https://chrome.google.com/webstore/devconsole> (one-time US$5 fee).
2. Click **New item** and upload `dist/tubeshield-1.0.0.zip`.
3. Fill in the listing using [store/LISTING.md](store/LISTING.md). It has the description, the
   single-purpose statement, a reason for each permission, and the privacy answers.
4. Upload the images from `store/` and `icons/icon128.png`.
5. **Privacy policy URL:** the store needs a public link to [PRIVACY.md](PRIVACY.md). If this
   repository is private, paste the policy into a public GitHub Gist or a page on your website and use that link.
6. Under **Distribution → Visibility**, pick:
   - **Unlisted**: only people with the link can find and install it (best for "just me").
   - **Public**: anyone can find it in the store.
7. Submit for review. Reviews usually take a few days.

## Development

```bash
npm test          # unit tests: ad pruning and the blocking rules
npm run e2e       # loads the extension in Chromium against a mock YouTube page
npm run build     # writes dist/tubeshield-<version>.zip for upload
python3 scripts/make-icons.py   # redraws the icons and promo tile
```

`npm run e2e` needs Playwright and its Chromium. It checks every layer, the off
switch, and that the settings and popup pages load without errors. It also refreshes
the store screenshots.

To release an update, bump `version` in **both** `manifest.json` and `package.json`,
run `npm run build`, and upload the new zip under **Package** in the developer dashboard.

### Files

```
manifest.json               extension definition (MV3)
src/background.js           applies settings, counts ads
src/content/prune-main.js   page-world script that strips ad data
src/content/skipper.js      auto-skip, cosmetic hiding, anti-adblock popup
src/shared/settings.js      defaults and storage helpers
rules/ad_rules.json         network blocking rules
popup/, options/            toolbar popup and settings page
store/                      Web Store listing text and images
```

## When YouTube changes things

YouTube changes its ad system often, and every ad blocker needs updates now and then.
If ads start getting through:

1. Make sure all four layers are on in Settings. Auto-skip is the safety net when the other layers miss something.
2. In a YouTube tab, open DevTools → Elements and find the class names on the new ad
   element, then add them to `DISPLAY_AD_CSS` or `SKIP_BUTTONS` in `src/content/skipper.js`.
3. If YouTube renames the ad keys in the player data, update `AD_KEYS` in
   `src/content/prune-main.js`.
