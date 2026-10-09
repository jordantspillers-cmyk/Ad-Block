# TubeShield privacy policy

_Last updated: October 9, 2026_

TubeShield is a YouTube ad blocker that runs entirely inside your Chrome browser.

## What TubeShield collects

Nothing. TubeShield has no servers, no accounts, no analytics, no crash reporting
and no remote configuration. It does not record, read or transmit what you watch,
search for or click.

## What TubeShield stores on your computer

Using Chrome's local extension storage (`chrome.storage.local`), on your device only:

- your on/off settings (six switches), and
- two counters: how many video ads were removed and how many were auto-skipped,
  plus the date counting started.

This data never leaves your computer. It is not synced to your Google account.
You can export it, import it or erase it at any time from the TubeShield settings
page. Uninstalling the extension deletes it.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| Access to youtube.com and youtube-nocookie.com | To hide ads on YouTube pages and remove ad data before YouTube's player sees it. TubeShield does not run on any other site. |
| `declarativeNetRequest` | To block requests from YouTube pages to ad servers and ad-tracking endpoints. Chrome does the blocking; TubeShield never sees the requests. |
| `scripting` | To switch the ad-removal script on and off when you change settings. |
| `storage` | To save your settings and counters on your computer. |

## Third parties

TubeShield shares no data with anyone, because it never sends any data anywhere.

## Contact

Questions: open an issue at https://github.com/jordantspillers-cmyk/Ad-Block/issues
