# Ad-Block: network-wide ad blocking for your whole Wi-Fi

This blocks ads, trackers, telemetry and malware sites for **every device on your
network** — phones, tablets, laptops, smart TVs, Roku/Fire TV/Chromecast,
game consoles, smart speakers and guests' devices. Nothing gets installed on the
devices themselves.

It runs [Pi-hole](https://pi-hole.net) in Docker with a curated set of
blocklists (about 300,000 domains in the default profile, over 1,000,000 in the
aggressive one) and scripts that set it up and keep it updated.

## How it works

```
 Phone / TV / Laptop ──"where is ads.example.com?"──▶  Ad-Block (Pi-hole)
                                                       │
            ◀────────── "nowhere (0.0.0.0)" ───────────┤  on a blocklist → blocked
            ◀────────── real address ──────────────────┘  normal site → forwarded to Quad9
```

Every device asks a DNS server to look up a name before it connects to it.
Your router tells devices which DNS server to use. Point the router at this box
and it answers every lookup for the house. Ad and tracker domains get a dead
address, so the ad never loads.

## What you need

- An **always-on computer on your home network** running Linux: a Raspberry Pi
  (3, 4 or 5), an old laptop or mini PC, or a NAS that runs Docker. It needs
  about 512 MB of RAM and should be **wired with Ethernet** if you can.
- Access to your **router's admin page**, to change one setting.

## Setup (about 10 minutes)

On the always-on machine:

```bash
git clone https://github.com/jordantspillers-cmyk/Ad-Block.git ad-block
cd ad-block
./scripts/install.sh
```

The installer:
1. installs Docker if it's missing,
2. frees port 53 if Ubuntu's built-in resolver is using it,
3. creates `.env` with a random dashboard password,
4. starts Pi-hole and loads the blocklists,
5. checks that ads are blocked and normal sites still load,
6. prints your machine's IP address and what to change on the router.

**Then do the router step:** set your router's DNS server to this machine's IP
address. Step-by-step instructions for common routers (Xfinity, Eero, Google/Nest
Wifi, Netgear, TP-Link, ASUS, Orbi, AT&T, Verizon and others) are in
**[docs/ROUTER-SETUP.md](docs/ROUTER-SETUP.md)**.

If your router won't let you change DNS, Pi-hole can take over handing out
addresses instead. See "Option B" in the same guide.

### Manual setup (without the installer)

```bash
cp .env.example .env        # set WEB_PASSWORD and TZ
docker compose up -d
./scripts/apply-lists.sh
./scripts/test-blocking.sh
```

## Checking that it works

- On any device on your Wi-Fi, open <https://adblock.turtlecute.org> or
  <https://d3ward.github.io/toolz/adblock>. Most tests should show as blocked.
- Open the dashboard at `http://<machine-ip>:8080/admin` to see every device's
  lookups and how many were blocked.
- From the server, run `./scripts/test-blocking.sh <machine-ip>`.

## Everyday use

| Task | How |
|---|---|
| Something won't load | Dashboard → **Query Log**, find the red (blocked) domain for that device, click **Allow**. Or add it to `blocklists/allowlist.txt` and run `./scripts/apply-lists.sh` |
| Block an extra site | Add it to `blocklists/denylist.txt` (its subdomains are blocked too), then `./scripts/apply-lists.sh` |
| Block more aggressively | `./scripts/apply-lists.sh aggressive`, or set `BLOCK_PROFILE=aggressive` in `.env` |
| Pause blocking for 5 min | Dashboard → **Disable blocking** → 5 minutes |
| Update everything | `./scripts/update.sh` (blocklists also refresh by themselves every week) |
| Turn it off completely | Change the router's DNS setting back, then `docker compose down` |

### Blocklist profiles

| Profile | What it blocks | Breakage |
|---|---|---|
| `standard` (default) | Ads, pop-ups, trackers, analytics, malware, phishing, smart-TV and phone telemetry (Samsung, LG, Roku, Fire TV, Apple, Windows, Xiaomi, Huawei and others), encrypted-DNS bypass servers | Rare |
| `aggressive` | Everything in standard, plus HaGeZi PRO++, threat-intel feeds and session-replay scripts | Occasional: some "sponsored" shopping results and email tracking links won't open |

The lists are plain text files in [`blocklists/`](blocklists/). Edit them freely.

## Making it airtight

Some devices ignore the router and use their own DNS. Chromecasts and some
smart TVs have Google's DNS built in, and some apps use encrypted DNS. The
standard profile already blocks the common encrypted-DNS servers, and Pi-hole
turns off Firefox's DNS-over-HTTPS and Apple's iCloud Private Relay for your
network. To close the remaining gaps with your router's firewall, see
**[docs/STOP-BYPASS.md](docs/STOP-BYPASS.md)**.

## What DNS blocking can't do

Be aware of these limits before you start:

- **YouTube video ads, Twitch ads, and sponsored posts inside Facebook,
  Instagram and TikTok are not blocked.** These services send ads from the same
  servers as the videos and posts, so a network blocker can't separate them
  without breaking the app. On computers, use the
  [uBlock Origin](https://ublockorigin.com) browser extension. On phones,
  watch YouTube in Firefox with uBlock Origin, or get YouTube Premium.
- **Ads built into a page's own content** (like a "sponsored" product on Amazon)
  come from the same server as the page, so they stay.
- **Devices on cellular data** aren't on your Wi-Fi, so they aren't protected.
  For protection away from home, install [Tailscale](https://tailscale.com) on
  the server and your phones, and set the server as your Tailscale DNS.
- **A VPN app on a device** sends that device's DNS through the VPN, so it
  isn't protected while the VPN is on.

On most networks it removes the bulk of ads: banner and pop-up ads on websites,
ads in free mobile apps and games, smart-TV home-screen ads, and most tracking
and telemetry.

## Troubleshooting

- **Nothing is being blocked on my devices.** Devices keep their old DNS until
  they reconnect. Toggle Wi-Fi off and on, or reboot the device. On a computer,
  check which DNS it's using: run `nslookup doubleclick.net`. The "Server" line
  should show the Pi-hole's IP. Also make sure your router doesn't list a
  **secondary DNS** like 8.8.8.8. Devices fall back to it and skip the blocker.
- **"Port 53 already in use."** Another DNS service is running. The installer
  handles Ubuntu's `systemd-resolved`. For anything else, stop that service and
  re-run the installer.
- **The internet stops working when the server is off.** Every lookup goes
  through it, so keep it powered on. A Raspberry Pi on a UPS or a reliable
  outlet works well. If it fails, set the router's DNS back to automatic to get
  online again.
- **View logs:** `docker logs pihole`

## Files

```
docker-compose.yml        Pi-hole service (normal mode: router hands out its IP as DNS)
docker-compose.dhcp.yml   Alternative: Pi-hole also acts as your DHCP server
.env.example              Settings template (password, time zone, upstream DNS, profile)
blocklists/               Blocklist profiles, allowlist and denylist (plain text)
scripts/install.sh        Guided install
scripts/apply-lists.sh    Load blocklists into Pi-hole (re-run after editing blocklists/)
scripts/test-blocking.sh  Verify blocking works
scripts/update.sh         Update Pi-hole and refresh lists
docs/ROUTER-SETUP.md      Pointing your router at the blocker
docs/STOP-BYPASS.md       Firewall rules to stop devices from bypassing it
```

## Credits

Built on [Pi-hole](https://pi-hole.net). Blocklists by
[HaGeZi](https://github.com/hagezi/dns-blocklists),
[Steven Black](https://github.com/StevenBlack/hosts) and
[Perflyst](https://github.com/Perflyst/PiHoleBlocklist).
