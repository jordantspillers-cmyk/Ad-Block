# Stopping devices from bypassing the ad blocker

After the router setup, most devices use the blocker automatically. A few try
to go around it:

| Bypass | Examples | Handled by |
|---|---|---|
| Hardcoded DNS servers (plain DNS, port 53) | Chromecast, Google TV, some Roku/Samsung/LG TVs, some IoT devices | **Router firewall** (below) |
| DNS-over-HTTPS (encrypted DNS over port 443) | Chrome/Edge "Secure DNS", some apps | ✅ `standard` profile blocks known DoH servers |
| DNS-over-TLS (port 853) | Android "Private DNS" | ✅ DoH list + **block port 853** (below) |
| Firefox automatic DoH | Firefox | ✅ Pi-hole answers Firefox's canary domain, so Firefox turns DoH off |
| iCloud Private Relay | iPhone, iPad, Mac | ✅ Pi-hole tells Apple devices Private Relay isn't available on this network |

## 1. Force all DNS through the blocker (the important one)

On a firewall-capable router, **redirect** every outgoing DNS request (port
53) from your LAN to the ad-block machine, except requests from the ad-block
machine itself. Devices with a hardcoded `8.8.8.8` then reach the ad blocker
without knowing it.

Below, `192.168.1.50` stands for your ad-block machine's IP.

> **Why two rules?** The ad blocker sits on the same LAN as the device. Without
> the second (masquerade) rule, its reply would go straight back to the device
> from an unexpected address, and the device would throw it away. Masquerading
> sends the reply back through the router so it comes from the right address.

### OpenWrt

Add to `/etc/config/firewall`, then run `/etc/init.d/firewall restart`:

```
# 1. Redirect all LAN DNS (except from the ad blocker itself) to the ad blocker
config redirect
    option name 'Force-DNS'
    option src 'lan'
    option src_dport '53'
    option proto 'tcp udp'
    option src_ip '!192.168.1.50'
    option dest_ip '192.168.1.50'
    option dest_port '53'
    option target 'DNAT'

# 2. Make the replies come back through the router
config nat
    option name 'Force-DNS-masq'
    option src 'lan'
    option proto 'tcp udp'
    option dest_ip '192.168.1.50'
    option dest_port '53'
    option target 'MASQUERADE'
```

Trade-off: redirected queries show up in the dashboard as coming from the
router instead of the device. Queries from devices that already use the
blocker still show normally.

### pfSense / OPNsense

Here it's easiest to redirect stray DNS to the **firewall's own resolver** and
have that resolver forward to the ad blocker:

1. System → General Setup → DNS Servers: `192.168.1.50`. Untick "Allow DNS
   server list to be overridden by DHCP/PPP on WAN".
2. Services → DNS Resolver: enable **Forwarding mode**. Or use the DNS
   Forwarder (dnsmasq) instead.
3. Firewall → NAT → Port Forward → Add:
   - Interface: LAN, Protocol: TCP/UDP
   - Source: **Invert match** ✔, Single host `192.168.1.50`
   - Destination: **Invert match** ✔, *LAN address*, port 53
   - Redirect target IP: `127.0.0.1`, port 53

### Asuswrt-Merlin (ASUS routers with Merlin firmware)

LAN → **DNS Director** (called "DNS Filter" on older versions) → Enable → Global
Redirection: **Custom 1** = `192.168.1.50`. Add the ad-block machine as a
client with mode **No Redirection**.

### UniFi, MikroTik and other routers with NAT rules

Create the same two rules as OpenWrt above: a **destination NAT** for TCP/UDP
port 53 from the LAN (excluding `192.168.1.50`) to `192.168.1.50:53`, plus a
**masquerade / source NAT** for LAN traffic going to `192.168.1.50:53`.

### Routers without NAT rules (Eero, Google Wifi, most ISP routers)

These can't redirect DNS. The next best option is to **block** outgoing port
53 from everything except the ad-block machine, if the router has any firewall
rules at all. Most of these don't. In that case the blocker still covers
almost all devices, and you can fix stubborn ones one at a time:

- **Chromecast / Google TV / Google Home:** these often use Google's DNS no
  matter what the router says. Only a redirect rule can catch them, so expect
  some ads on these devices.
- **Android phones:** Settings → Network & internet → **Private DNS** → *Off*.
- **Chrome / Edge:** Settings → Privacy and security → Security → **Use secure
  DNS** → *Off*.

## 2. Block DNS-over-TLS (port 853)

Add a firewall rule: **LAN → WAN, TCP+UDP port 853, Reject**, except from
the ad-block machine. Android's "Automatic" Private DNS then falls back to the
blocker.

## 3. Check it

From a laptop on your network, ask Google's DNS directly for an ad domain:

```bash
nslookup doubleclick.net 8.8.8.8
```

If the answer is `0.0.0.0`, the redirect is working: you asked Google but the
ad blocker answered. If you get a real IP, DNS on port 53 is still leaving your
network.
