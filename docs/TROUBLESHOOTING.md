# Troubleshooting

## FTP: `ConnectorError: Unable to find valid port` (PASV hangs)

**Symptom.** Camera uploads stop. Container log shows, on the `PASV`
directive:

```
ConnectorError: Unable to find valid port ... code: 400
Satisfy Parameters Error { error: 'Socket not writable' }
```

Often after working fine for days, with maybe one file sneaking through before
it wedges.

**Cause.** Passive-port pool exhaustion. Each PASV request makes `ftp-srv`
open a data port from the configured range. Sony cameras frequently drop data
connections without closing them cleanly, so passive listeners linger instead
of freeing up. With a narrow range (the original 10 ports, 50000-50009) the
pool slowly leaks until none are free — then every PASV fails and the control
socket dies. It's runtime exhaustion, not a config error.

**Immediate fix.** Restart the container. This releases every leaked port and
the camera uploads again at once. `ftp.json`, photos, and transfer history all
live in mounted volumes, so nothing is lost on restart.

```
docker restart sonycamera-transfer
```

**Permanent fix.** Widen the passive range to ~40 ports so the pool outlasts
the OS's lingering-socket cleanup. The range must match in **three places**,
or `ftp-srv` will hand out a port that Docker hasn't published and PASV will
hang:

1. **`data/ftp.json` on unraid** (drives `ftp-srv`): `"pasvMax": 50049`.
2. **`.env` on unraid** (drives the Docker port publish): `FTP_PASV_MAX=50049`.
   If the line is absent it inherits the compose default (now 50049); if it's
   present it must be set explicitly.
3. **Recreate** the container so the new published range takes effect — a
   restart is not enough for a port change:

   ```
   docker compose up -d   # or re-apply the unraid template
   ```

Repo defaults (`docker-compose.yml`, `.env.example`) already ship 50049, so
fresh deploys inherit the wide range.

**Don't over-widen.** Docker creates a proxy/iptables rule per published port,
so a huge range (e.g. 50000-51000) makes the container slow to start and
heavier in memory. ~40 ports is ample for a single camera.

**If it still recurs at 40 ports** — that would indicate a genuine socket
leak in `ftp-srv` 4.6.3 rather than mere undersizing. The fix then is a
connection idle-timeout or a library bump. Not worth pre-solving unless it
actually happens.
