## Codex 重置预测看板

- 内置官方 Codex 运行程序，自动检测本机授权；未登录时在看板完成 ChatGPT 登录，随后自动读取额度。
- 新增 AI 部署入口，自动下载、校验、安装并检查额度，实际读到额度才报告部署完成。
- 请求超时调整为 30 秒；连续 3 次临时失败才显示获取失败，前两次自动重试，缓存按原有效期使用。

- 重置后默认 6 小时内不再重置，自动清理这段时间内的旧预告；重置后新发布的明确预告优先。

- 本机额度重置后，点“确认收到”可将重置系统通知静默 6 小时；重启后继续计时。
- 修复重置后旧预告仍显示红色重置节奏线的问题；重置后的新预告继续正常显示。

- 修复套餐限定重置完成消息的系统提醒；保留套餐筛选与同类消息合并。
- 验证中英文切换、设置保存和重启恢复，补充英文变化记录翻译。

一款 Windows 桌面看板，用来查看 Codex 剩余额度、跟踪五个网站的重置预告，并比较历史重置时间。

- 三条消耗横条：实际消耗、个人周期均匀节奏、假设每 X 天重置一次的节奏。可拖动排序，X 默认 3 天。
- 有适用当前套餐的定时自动重置预告时，界面切换为珊瑚橙，显示倒计时和红色重置节奏线。红线在预告时刻到达 100%，不同时间形成双线范围。
- 展开历史记录，逐站比对时间与原帖。
- 检测到适用当前套餐、带具体时间的自动重置预告或完成消息时，Windows 自动弹窗。点“确认收到”关闭；相近时间的消息合并提醒。
- 中英双语、字号调整、通知开关、托盘监控、开机启动。

[图文介绍](https://zzy2670.github.io/codex-reset-forecast-dashboard/) · [安装说明](https://github.com/zzy2670/codex-reset-forecast-dashboard/blob/main/README.zh-CN.md)

## English

- Includes the official Codex runtime and detects existing local authorization. Sign in with ChatGPT from the dashboard to connect your quota.
- Adds an AI deployment entry that downloads, verifies and installs the app, then checks that quota can actually be read.
- Requests time out after 30 seconds. The first two temporary failures retry automatically; the third displays an error. Cached data keeps its original expiry.

- After a reset, the dashboard assumes a six-hour gap and clears older forecasts within it. New explicit announcements after the reset take priority.

- After a local quota reset, click Acknowledge to mute reset notifications for six hours. The timer continues across restarts.
- Fixed old forecasts keeping the red reset pacing line visible after a reset. New announcements after the reset remain active.

- Fixed notifications for plan-specific reset completions, with plan matching and related-message grouping.
- Verified English/Chinese switching, saved preferences and language restoration after restart; completed translations for update records.

A Windows dashboard for your remaining Codex quota and reset announcements from five websites. Check upcoming reset times, compare your usage and browse past resets.

- Three usage bars: actual consumption, even personal-cycle usage and an assumed X-day reset cycle. Drag to reorder; X starts at 3 days.
- A timed automatic-reset announcement for your plan switches the dashboard to coral orange and adds a countdown and red reset pacing line. The line reaches 100% at the announced time; different times form a two-line range.
- Expand history to compare each site’s timestamp and original post.
- When a source reports an automatic-reset announcement or confirmation for your plan with a specific time, Windows shows a notification. It stays until you click Acknowledge. Similar reset times are grouped.
- English and Chinese, text size controls, notification settings, tray monitoring and Windows startup.

[Feature tour](https://zzy2670.github.io/codex-reset-forecast-dashboard/) · [Installation guide](https://github.com/zzy2670/codex-reset-forecast-dashboard/blob/main/README.md)
