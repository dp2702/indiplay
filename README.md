# Musify Lite

Musify Lite is a static, GitHub Pages-friendly music app built around native Invidious search and embedded playback.

## Features

- Search using the configured Invidious instance
- Play media through Invidious embed URLs with Listen and Video modes
- Keep a local queue, favorites, playlists, and history in browser storage
- Export and import a backup JSON file
- Responsive dark/light UI
- Works without a backend or build step

## Local usage

1. Open `index.html` in a browser, or publish the repository to GitHub Pages.
2. Confirm the configured Invidious instance is reachable.
3. Search for a track, paste a supported URL or video ID, and play it.

## Notes

- This app intentionally does not attempt to inspect or control the contents of the Invidious iframe.
- Search results are meant to be copied and pasted into the app through the provided workflow.
- Playback depends on the configured public Invidious instance and the availability of the companion media host.

## Repository structure

- `index.html` — single-page app
- `plan.md` — build plan and acceptance criteria
- `README.md` — project overview

## Privacy and network rules

- Data stays in the browser via `localStorage`.
- No custom backend is required.
- No blocked direct YouTube media URLs are used.
