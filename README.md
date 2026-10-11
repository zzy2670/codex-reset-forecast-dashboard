# Codex Reset Forecast Dashboard

[简体中文](README.zh-CN.md) · [Feature tour](https://zzy2670.github.io/codex-reset-forecast-dashboard/) · [Download for Windows](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest)

A Windows dashboard for your remaining Codex quota and reset announcements from five websites. Check upcoming reset times, compare your usage and browse past resets.

Windows 10/11 x64. The app supports English and Chinese; the feature tour supports seven languages.

![The complete Codex dashboard](docs/assets/feature-overview.png)

## Install

1. Download the installer from [Releases](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest) and run it, or open the portable executable.
2. Open the dashboard to see public reset announcements. Choose your language, text size, tray behavior and startup settings.
3. To show personal quota, install the official [Codex CLI](https://github.com/openai/codex) and sign in with your ChatGPT account:

```powershell
npm install -g @openai/codex
codex login
```

Refresh quota or restart the dashboard after signing in.

<details>
<summary>Installation and runtime notes</summary>

- The dashboard detects an npm-installed CLI or codex.exe on PATH. If you use the Codex desktop app, also install the CLI using the steps above. Personal quota comes from the windows returned for your ChatGPT login.
- Release binaries are unsigned, so Windows may show an unknown-publisher prompt. SHA256SUMS.txt is included in each release to check your download.
- Both installed and portable versions save settings and cached data in your Windows profile. Upgrades keep that data.
- Startup with Windows is enabled by default and can be changed in Settings. Windows notification settings and Do Not Disturb affect notification display.

</details>

## Routine and accelerated modes

![Routine mode on the left; accelerated mode on the right.](docs/assets/feature-modes.png)

Routine mode shows your quota in green. A timed automatic-reset announcement for your plan switches the dashboard to coral orange and adds a countdown.

## Quota usage

![Usage bars, drag handle and assumed reset interval.](docs/assets/feature-pace.png)

Compare actual usage with even usage across your personal cycle and an assumed X-day reset cycle. X starts at 3 days; click its label to change it. Drag a handle to reorder the bars.

## The red reset pacing line

![One reset time on the left; a time range on the right.](docs/assets/feature-forecast.png)

The line moves right and reaches 100% at the announced reset time. Compare it with your usage bar. Matching times share a line; different times create two lines and a red band.

## Five reset sources

![Forecasts and expanded source details.](docs/assets/feature-sources.png)

Each card shows the site’s next reset time, announcement and update time. Expand the details to read the post and open its link. NextReset and TIBO share a feed.

| Source | Fetch interval | Feed |
| --- | --- | --- |
| [Codex Reset](https://codex-reset.com/) | 30 seconds | Codex Reset |
| [Did Codex Reset](https://didcodexreset.com/) | About 3.5 minutes | Did Codex Reset |
| [NextReset](https://nextreset.ai/) | 30 seconds | Codex Resets |
| [TIBO](https://tibo.cc/) | 30 seconds | Same feed as NextReset |
| [Codex Reset Today](https://codex-reset.today/) | 30 seconds | Upstream pending confirmation |

## Reset history

![Latest reset and an expanded history record.](docs/assets/feature-history.png)

Browse resets from September 2026, newest first. Expand a record to compare each site’s timestamp and original post. The latest cross-checked reset and elapsed time appear at the top of the dashboard.

## Automatic Windows notifications

![Windows notification illustration: reset time, plan and Acknowledge button.](docs/assets/feature-notifications.png)

When a source reports an automatic-reset announcement or confirmation for your plan with a specific time, Windows shows a notification. It stays until you click Acknowledge. Similar reset times are grouped.

## Display and background settings

![Language, tray, startup, text size and notifications.](docs/assets/feature-settings.png)

Choose English or Chinese, adjust text size, and enable notifications, tray monitoring or startup with Windows.

Personal quota is read through the official local Codex service; settings and cached data are stored on your computer. See [Privacy](PRIVACY.md) for data flows.

## Run from source

Use Windows x64 and Node.js 24:

```powershell
npm ci
npm test
npm run check
npm run test:ui
npm start
npm run build
```

Installer and portable builds go to dist/. GitHub Actions checks the code, builds the app and publishes checksums. GitHub Pages hosts the feature tour. Run npm run assets to regenerate the eight feature images using demo data; this needs a locally installed Chrome.

## License and feedback

**GPL-3.0-only.** When distributing a modified version, provide the corresponding source under GPL-3.0. See [LICENSE](LICENSE) and [third-party notices](NOTICE.md).

For bugs, include your app version, steps to reproduce and error messages in an [Issue](https://github.com/zzy2670/codex-reset-forecast-dashboard/issues).
