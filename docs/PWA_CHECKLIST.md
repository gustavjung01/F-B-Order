# PWA Checklist - Bep Si FB

Goal: make the web app installable, update-safe, and ready for mobile testing from the beginning.

## Install

- Android Chrome: install by Add to Home Screen.
- iPhone Safari: install by Share > Add to Home Screen.
- Facebook/Zalo in-app browser: show open-in-browser guidance.

## Manifest

Required fields:

- name
- short_name
- start_url
- scope
- display standalone
- theme_color
- background_color
- icons 192, 512, maskable

## Service worker rules

- Cache app shell.
- Do not cache API.
- Do not cache admin.
- Do not cache service-worker.js.
- Do not cache manifest.
- Do not cache app-version.json.
- HTML should be network first.
- Static assets should be cache first.

## Auto update test

Current repo uses:

- app-version.json
- pwa-update-toast.js
- pwa-register.js
- service-worker.js

Test flow:

1. Open installed PWA.
2. Open /app-version.json.
3. Deploy a new build.
4. Focus the app again.
5. App detects new version.
6. User confirms update.
7. Page reloads to the new build.

## Logo and icons

Required files:

- icon-192.png
- icon-512.png
- maskable-512.png
- apple-touch-icon.png
- favicon.ico

Design rules:

- Looks good at small size.
- No long text inside the app icon.
- Prefer a strong B mark with F&B symbol.
- Warm orange, teal, charcoal.
- Maskable icon needs safe area.

## Lighthouse

Check:

- Installable.
- Manifest valid.
- Service worker active.
- HTTPS.
- Apple touch icon.
- Theme color.
- Offline cached pages open again.
