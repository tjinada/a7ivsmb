# Remote access — camera FTP over Tailscale (travel router)

**Status:** Approved 2026-06-24. Resolves the off-network path parked in
[`DESIGN.md`](./DESIGN.md) §12 ("Field / off-network phone-relay path").

## Summary

The original design assumed **LAN-only**: camera and unraid on the same
network. This documents how the camera uploads while travelling **without
adding any upload path or app code** — a travel router *extends the LAN*
over Tailscale, so the camera still "reaches the unraid LAN", just virtually.

- The dropped **"Path B" (phone relay) is not needed.** The camera keeps
  using its native FTP exactly as on the home LAN.
- **Zero backend changes.** Everything required (`pasv_url` wiring, exposed
  passive range, auto-filing) already shipped in Phase 2.
- The only change is **one config value** in the live `ftp.json` on unraid.

## Network identity (this tailnet)

| Thing                  | Value                          |
|------------------------|--------------------------------|
| unraid Tailscale IP    | `100.113.192.56`               |
| unraid MagicDNS name   | `tower.tail46d65f.ts.net`      |
| PWA (browse) URL        | `http://tower.tail46d65f.ts.net:8096` |

> **MagicDNS only resolves on tailnet members.** Your phone (running
> Tailscale) can browse the PWA by the MagicDNS name. The **camera cannot** —
> it is a dumb FTP client on the router's WiFi, not a tailnet member, so it
> must target the **IP `100.113.192.56`**, never the hostname.

## The one config change (unraid)

Set the FTP server's advertised passive address to the **Tailscale IP** so it
works both at home and away (see rationale below).

In the live `data/ftp.json` on unraid (appdata volume — **not** in git;
`data/` is gitignored runtime state):

```json
{
  "enabled": true,
  "port": 21,
  "user": "<camera-user>",
  "pass": "<camera-pass>",
  "pasvMin": 50000,
  "pasvMax": 50009,
  "externalIp": "100.113.192.56",
  "ftpsEnabled": false
}
```

Then restart the container. `ftp.config.ts` reads `externalIp` →
`ftp.service.ts` sets it as `ftp-srv`'s `pasv_url`, so PASV data connections
are advertised on `100.113.192.56`, which the camera can reach over the tunnel.

> `ftp.json` **wins over `.env` after first run.** Editing `.env` on a running
> instance does nothing — edit this file (or the Phase 4 Settings UI if/when
> it lands), then restart.

## Why `externalIp` = the Tailscale IP, permanently

The PASV address must be something the camera can actually open a data
connection back to. That address differs by context:

- **Home LAN:** `192.168.0.243` works, but only at home.
- **Tailscale `100.113.192.56`:** works **both** at home (router + devices on
  the tailnet) **and** away — one static value, no editing per trip.

Picking the `100.x` address everywhere is the KISS resolution: set once, never
touch it again. The only theoretical downside is a marginally less-direct path
for any client that FTPs over the raw LAN *without* the tailnet — which the
camera never does (it always connects via the router).

## Camera setup (Sony A7 IV)

Connect the camera to the **travel router's WiFi**, then register the FTP
server: `MENU → Network → FTP Transfer Func. → Server Setting`.

| Field            | Value                                   |
|------------------|-----------------------------------------|
| Host             | `100.113.192.56`  (the IP, **not** the MagicDNS name) |
| Port             | `21`                                    |
| Directory        | `/`  (the server sandboxes to the share; auto-filing sorts into `YYYY-MM-DD/JPG\|RAW/`) |
| Secure (FTPS)    | Off  (`ftpsEnabled: false`)             |
| Anonymous        | Off                                     |
| User / Password  | the camera credentials from `ftp.json`  |

Then turn **FTP Transfer Func. On**. Transfer-as-you-shoot vs.
transfer-selected is your preference.

> **Bandwidth tip (optional):** over hotel/cellular uplink, RAW (~50 MB each)
> is slow. Consider pushing **JPEG-only when remote** and letting RAW sync at
> home on the LAN — the gallery pairs the RAW back in later. This is a
> camera-side choice, no app change.

## Travel router (GL.iNet Beryl AX)

1. **Distinct LAN subnet.** If the router defaults to `192.168.8.x` and that
   collides with anything en route, change it (`Network → LAN`). Subnet
   collisions silently break routing.
2. **Join the tailnet.** `Applications → Tailscale`, authenticate to the same
   tailnet `tower` is on.
3. **Route LAN clients → tailnet** (the load-bearing, fiddly step). The camera
   sits on the router's LAN and must be able to reach `100.113.192.56`. This
   is the *less-documented* direction of GL.iNet Tailscale routing — the easy
   GUI path is the reverse (tailnet → router LAN). Expect to possibly:
   - update the router's bundled Tailscale binary (it ships old), and
   - enable LAN→tailscale forwarding with masquerading / `--accept-routes`.
   - **A firmware update overwrites the Tailscale binary** — redo if so.
4. **Internet on the go:** use `Repeater / WISP` to join the Airbnb's WiFi as
   WAN. No Ethernet required.
5. Optional: VPN kill-switch so the camera never FTPs out over open internet
   if the tunnel drops.

## Split routing (camera home, your browsing local)

Tailscale subnet routing only carries tailnet-bound traffic, so the camera's
upload to `100.113.192.56` goes home while your phone's general browsing exits
locally through the Airbnb WiFi at full speed. No exit node needed. Only set
an exit node if you *want* all traffic routed home (geo-unblocking / untrusted
WiFi) — at a speed cost.

## At the Airbnb — captive portals

Hotels/Airbnbs often gate WiFi behind a "click to accept" page. The router
can't click it, so the WAN looks connected but no traffic flows. Fix: connect
a phone to the **router's** WiFi, open a browser, accept the portal — that
authorises the router's MAC. Then the camera's path home works.

## Pre-trip test (do this before relying on it)

Prove the tunnel from *outside* the house at least once:

1. Tether the Beryl's WAN to your **phone hotspot** (simulates a foreign
   network).
2. From a **laptop on the Beryl's WiFi** — deliberately *not* running
   Tailscale itself, so it's a dumb client just like the camera — open an FTP
   client to `100.113.192.56:21` and upload a test JPG.
3. Confirm it lands in today's `YYYY-MM-DD/JPG/` and shows in the gallery.

If the laptop-on-Beryl test passes, the camera will work. If it fails, the
problem is the **router's LAN→tailnet routing** (step 3 above), not the camera.

## Failure isolation (bring-up order)

1. **FTP works on the home LAN** — already proven (camera uploads on LAN). ✅
2. **Router joins tailnet** — GL.iNet shows Tailscale connected.
3. **Laptop on Beryl WiFi reaches `100.113.192.56`** — proves LAN→tailnet
   routing.
4. **Camera points at `100.113.192.56`** — only after step 3 passes.

## What did NOT change

- No backend/app code. `pasv_url`, passive range exposure, and auto-filing
  all pre-exist (Phase 2).
- The PWA stays pull-only; browse it at `http://tower.tail46d65f.ts.net:8096`
  from any tailnet device.
- `data/` remains gitignored runtime state; this is an ops edit on unraid,
  not a repo change.
