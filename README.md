# Codex Reset Forecast Dashboard

[简体中文](README.zh-CN.md) · [Multilingual feature tour](https://zzy2670.github.io/codex-reset-forecast-dashboard/) · [Download](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest)

A Windows dashboard for public Codex reset forecasts, local quota consumption pacing and multi-source evidence. **English + Chinese application**, seven website languages. Independent community project; forecasts are references, not reset guarantees.

## Install

1. Open [Releases](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest), download `Codex-Reset-Forecast-Dashboard-Setup-2.0.0-x64.exe` and run the installer. Requires Windows 10/11 x64. The portable `.exe` is available if you prefer no installation.
2. Open the app. Public sources work without a dashboard account or API key. In Settings, select English or Chinese, adjust text size, and choose tray monitoring / start at sign-in.
3. For **personal quota**, install the official [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`) and sign in with `codex login`. Restart the dashboard or refresh quota. A CLI installed through npm or a `codex.exe` on PATH is detected. Desktop-app-only installations are not guaranteed to be detected. An API-key-only account may not return ChatGPT quota windows.

The current binaries are unsigned, so Windows may show an unknown-publisher warning. Verify the release SHA-256 checksum and source before deciding to run them. Portable settings still use your Windows profile. Upgrades retain settings and local data; the executable/data identity stays compatible with earlier versions. Autostart defaults to enabled and can be turned off in Settings.

## A calm overview, then a visible acceleration signal

![Routine and accelerated modes](docs/assets/feature-modes.png)

Routine monitoring uses dark green. A fresh, applicable announcement with a concrete time switches to amber and displays a target pace. Hints, untimed promises, stale data and reset-credit-only news do not trigger automatic-reset urgency.

## Quota consumption pacing

![Three comparable consumption tracks](docs/assets/feature-pace.png)

Actual consumption, personal-cycle even pace, and an assumed X-day reset rhythm (default three days) share a percentage scale. Drag rows to reorder; your preference is saved locally. Global forecasts do not overwrite your personal cycle.

## The moving red target line

![Single deadline and target range](docs/assets/feature-forecast.png)

Like a swimming record line, it advances with time: `(now − verified anchor) / (forecast deadline − anchor)`. It reaches 100% at the announced deadline. Identical times use one line; different future times create fast/slow boundaries with a glowing band. A verified global reset is the preferred anchor, with a real personal-cycle start as fallback. Missing anchors produce no invented line. Past endpoints leave the next forecast while original evidence remains available. Reaching the deadline does not confirm replenishment.

## Five sources and their evidence

![Five sources with expanded evidence](docs/assets/feature-sources.png)

| Source | Polling | Collection chain |
| --- | --- | --- |
| [Codex Reset](https://codex-reset.com/) | 30 seconds | Codex Reset |
| [Did Codex Reset](https://didcodexreset.com/) | About 3.5 minutes | Did Codex Reset |
| [NextReset](https://nextreset.ai/) | 30 seconds | Codex Resets upstream |
| [TIBO](https://tibo.cc/) | 30 seconds | Same upstream as NextReset |
| [Codex Reset Today](https://codex-reset.today/) | 30 seconds | Independence unverified |

The app compares source update times, next deadlines, original announcements and explanations. Five websites do **not** mean five independent confirmations. Site collection delay and rate limits affect availability. A model probability is not a historically validated accuracy score.

## History with provenance

![Calibrated latest reset and historical evidence](docs/assets/feature-history.png)

Public completion records from September 1, 2026 onward appear newest first. Expand a row to compare each site's recorded time, original link and collection chain. Shared upstream feeds are deduplicated; disagreements remain visible. Global resets, plan-limited resets and reset credits stay distinct.

## Bilingual and local

![Language and background settings](docs/assets/feature-settings.png)

Switch application controls between English and Chinese; original source quotes remain original. Body text and smaller labels scale together while large figures retain their size. Timed reset messages use persistent Windows reminder toasts with **Acknowledge**; near-identical times are grouped across sources to avoid repeated popups. Windows notification settings and Do Not Disturb can affect display. Closing to tray keeps polling active.

All promotional images use **synthetic demonstration data**, not live forecasts or personal account information. See [privacy](PRIVACY.md) for actual data flows.

## Build from source

Use Node.js 24 on Windows x64, then:

```powershell
npm ci
npm test
npm run check
npm run test:ui
npm start
npm run build
```

Output goes to ignored `dist/`. CI repeats tests and privacy checks, builds both Windows targets, checks the packaged app and publishes SHA-256 hashes. GitHub Pages serves `docs/`. No AI service key is needed for build or publication. `npm run assets` regenerates the six annotated promotional images using isolated synthetic states and a locally installed Chrome for composition; it does not poll sources or send notifications.

## License and contributions

**GPL-3.0-only.** Distributed modifications must follow GPL-3.0 and provide corresponding source. See [LICENSE](LICENSE) and [third-party notices](NOTICE.md). Report source-schema changes and reproducible bugs through [Issues](https://github.com/zzy2670/codex-reset-forecast-dashboard/issues); never include tokens, local state files or personal quota screenshots.
