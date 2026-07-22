# Bếp Sỉ systemd units

This directory contains only Bếp Sỉ service units.

`bepsi-ai-worker.service` is installed by `scripts/phase7/deploy-bepsi-backend.sh` into `/etc/systemd/system/` and runs the standalone AI worker from `/srv/apps/bepsi/current`.

Do not add units or restart commands for other applications hosted on the same VPS.
