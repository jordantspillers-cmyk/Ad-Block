# Pointing your network at the ad blocker

Your router tells every device which DNS server to use. Change that one
setting to your ad-block machine's IP address (the installer printed it, for
example `192.168.1.50`) and every device on the Wi-Fi is protected.

## Step 0: Give the ad-block machine a fixed IP address

If its address changes, the whole network loses DNS. In your router's admin
page, find **DHCP reservation**, **Address reservation**, **Static lease** or
**Fixed IP**, and reserve the current IP for the ad-block machine.

To find your router's admin page, open `http://192.168.1.1`, `http://192.168.0.1`
or `http://10.0.0.1` in a browser, or use the router's phone app. The login is
usually printed on a sticker on the router.

## Option A (recommended): Change the router's DNS server

Find the **LAN / DHCP** settings, not the WAN/Internet ones, and set:

- **Primary DNS:** your ad-block machine's IP
- **Secondary DNS:** leave it **empty**, or enter the same IP again

> ⚠️ Don't use 8.8.8.8 or 1.1.1.1 as the secondary. Devices switch between
> DNS servers freely, so ads will keep getting through.

Then reconnect devices to the Wi-Fi, or just wait. Most devices pick up the
change within a day, when their address lease renews.

### Where the setting is on common routers

| Router | Where to look |
|---|---|
| **Xfinity / Comcast gateway** | Xfinity gateways don't allow custom DNS. Use **Option B**, or put the gateway in bridge mode and use your own router. |
| **Eero** | Eero app → Settings → Network settings → DNS → Customized DNS |
| **Google / Nest Wifi** | Google Home app → Wi-Fi → Settings → Advanced networking → DNS → Custom |
| **Netgear (Nighthawk)** | Advanced → Setup → Internet Setup → Domain Name Server (DNS) Address → *Use These DNS Servers*. Some Netgear models only offer this WAN setting, which works the same way: devices get the router as DNS, and the router asks the ad blocker. If so, the dashboard shows the router as the only client. |
| **Netgear Orbi** | Orbi web UI (orbilogin.com) → Advanced → Setup → Internet Setup → DNS address |
| **TP-Link (Archer)** | Advanced → Network → DHCP Server → Primary DNS |
| **TP-Link Deco** | Deco app → More → Advanced → DHCP Server → DNS address |
| **ASUS** | LAN → DHCP Server → DNS Server 1. Also set Advertise router's IP in addition to user-specified DNS = **No** |
| **Linksys** | Connectivity → Local Network → DHCP Server → Static DNS 1 |
| **AT&T BGW210/320** | AT&T gateways don't allow custom DNS. Use **Option B**. |
| **Verizon Fios router** | Advanced → Network Settings → Network Connections → Broadband Connection → Settings → DNS Server: Use the following DNS server addresses |
| **Spectrum router** | Spectrum app routers usually don't allow DNS changes. Use **Option B**. |
| **UniFi** | Settings → Networks → (your LAN) → DHCP Service Management → DNS Server → Manual |
| **OpenWrt** | Network → Interfaces → LAN → Edit → DHCP Server → Advanced Settings → DHCP-Options: `6,<ad-block-ip>` |
| **pfSense / OPNsense** | Services → DHCP Server → LAN → DNS servers |

Menus move around between firmware versions. If you can't find it, search
"`<your router model>` change DHCP DNS server".

## Option B: Let Pi-hole hand out addresses (router can't change DNS)

Use this if your router (often an ISP-supplied one) won't let you change DNS.
Pi-hole takes over the router's DHCP job and gives every device its own IP as
DNS.

1. Give the ad-block machine a **static IP** in its own network settings.
   Pick one outside the range the router hands out, for example
   `192.168.1.2`. (With DHCP off on the router, a reservation no longer
   applies.)
2. Add these lines to `.env`, adjusted to your network:
   ```
   DHCP_START=192.168.1.100
   DHCP_END=192.168.1.250
   DHCP_ROUTER=192.168.1.1        # your router's IP
   DHCP_NETMASK=255.255.255.0
   ```
3. Switch to the DHCP version:
   ```bash
   docker compose down
   docker compose -f docker-compose.dhcp.yml up -d
   ./scripts/apply-lists.sh
   ```
   The dashboard is still on port 8080.
4. **Turn OFF the DHCP server on your router.** It's usually under LAN
   settings. Two DHCP servers on one network cause chaos.
5. Reconnect or reboot your devices.

To undo: turn the router's DHCP back on, then run
`docker compose -f docker-compose.dhcp.yml down && docker compose up -d`.

## IPv6

If your network has IPv6, some routers also advertise their own IPv6 DNS
server, which lets devices skip the blocker. If ads still appear after setup,
either set the router's IPv6 DNS to the ad-block machine's IPv6 address or
turn off IPv6 DNS advertisement (RDNSS) on the LAN. Turning off IPv6 on the
LAN entirely also works for most homes.

## Guest network and mesh points

Guest Wi-Fi networks often have their own DHCP settings. Change the DNS there
too, or guests won't be protected. Mesh satellites (Eero, Deco, Orbi) use the
main router's settings automatically.
