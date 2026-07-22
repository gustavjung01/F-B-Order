# Bếp Sỉ AI worker service

AI jobs are processed by a standalone systemd service:

- API: `bepsi-api.service`
- AI worker: `bepsi-ai-worker.service`
- Release root: `/srv/apps/bepsi/current`
- Shared environment: `/etc/app-env/bepsi.env`

The API process must never import or start `startAiWorker`. The worker entrypoint is:

```bash
node /srv/apps/bepsi/current/apps/backend/dist/ai-worker.js
```

Production deployment installs the unit from:

```text
scripts/phase7/systemd/bepsi-ai-worker.service
```

and restarts only the two Bếp Sỉ units. It must not touch any other application service on the VPS.

Useful checks after deployment:

```bash
sudo systemctl status bepsi-api.service --no-pager
sudo systemctl status bepsi-ai-worker.service --no-pager
sudo journalctl -u bepsi-ai-worker.service -n 100 --no-pager
```

A graceful worker shutdown stops polling, waits for the active tick, and then closes the PostgreSQL pool.
