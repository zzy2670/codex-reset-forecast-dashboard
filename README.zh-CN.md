# codex重置预测看板

[English](README.md) · [图文介绍](https://zzy2670.github.io/codex-reset-forecast-dashboard/) · [下载 Windows 版](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest)

汇总五个网站的 Codex 重置预告，显示本机剩余额度。有具体重置时间时，看板变成橙色，红色“游泳线”随时间推进，方便你安排重置前的使用节奏。

适用于 Windows 10/11 x64。软件支持中英双语，介绍页可切换中、英、日、韩、西、法、德七种语言。

## 安装

1. 在 [Releases](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest) 下载安装版并双击安装，或直接运行便携版。
2. 打开看板即可查看公开重置消息。在设置中选择语言、字号、托盘和开机启动。
3. 要显示个人额度，安装官方 [Codex CLI](https://github.com/openai/codex)，并登录你的 ChatGPT 账户：

```powershell
npm install -g @openai/codex
codex login
```

登录后刷新额度，或重启看板。

<details>
<summary>安装与运行说明</summary>

- 看板识别 npm 安装的 CLI 或 PATH 中的 codex.exe。已安装 Codex 桌面版的用户也请按上面的步骤安装 CLI。个人额度来自 ChatGPT 登录后的额度窗口。
- 发行包未签名，Windows 可能显示未知发布者提示。发行页附有 SHA256SUMS.txt，可用于核对下载文件。
- 设置和缓存保存在 Windows 用户目录，安装版和便携版均使用此位置。升级会保留数据。
- 开机启动默认开启，可以在设置中关闭。Windows 的通知开关与勿扰模式会影响通知显示。

</details>

## 有重置预告时，看板变成橙色

![左侧常规模式，右侧加速模式](docs/assets/feature-modes.png)

平时用黑绿色调显示额度与消耗节奏。适用当前套餐的自动重置预告给出具体时间后，切换为黑橙色，显示倒计时和红色目标线。距离重置还有多久、剩余额度该怎么用，可以一起看。

## 用了多少，和计划比一比

![三条消耗横条及拖动位置](docs/assets/feature-pace.png)

三条横条分别显示实际消耗、假设每 X 天重置的节奏，以及个人周期内的均匀节奏。X 默认 3 天，可以手动修改。拖动横条旁的把手即可换顺序，看板会记住你的排列。

## 跟着红色“游泳线”安排消耗

![一个预告时间用单线，多个时间用双线和荧光范围](docs/assets/feature-forecast.png)

红线随时间向右走，在预告重置时刻到达 100%。它贯穿三条横条，便于和实际消耗对照。同一时间合为一条线；不同时间画两条线，中间用红色荧光标出范围。

## 五个网站的消息，横着看

![五个信源的预计时间、原帖和展开详情](docs/assets/feature-sources.png)

每个信源各占一列，上方显示下次预计时间，下方显示原帖和更新时间。点击展开详情，可逐站比对。没有有效预告时，时间位置显示“无”；过期时间自动撤下，原始消息留在详情中。

| 信源 | 获取间隔 | 来源 |
| --- | --- | --- |
| [Codex Reset](https://codex-reset.com/) | 30 秒 | Codex Reset |
| [Did Codex Reset](https://didcodexreset.com/) | 约 3.5 分钟 | Did Codex Reset |
| [NextReset](https://nextreset.ai/) | 30 秒 | Codex Resets |
| [TIBO](https://tibo.cc/) | 30 秒 | 与 NextReset 共用上游 |
| [Codex Reset Today](https://codex-reset.today/) | 30 秒 | 上游待确认 |

比对时按采集来源分组，NextReset 和 TIBO 归入同一组。

## 上次什么时候重置，各站怎么记的

![最近一次重置与展开的历史记录](docs/assets/feature-history.png)

顶部显示最近一次重置和距今时长。历史从北京时间 2026 年 9 月 1 日开始，最新记录在最上面。展开一条记录，可以查看各站记录到秒的时间、原帖和共用来源，比较时间差异。记录同时标明全局重置、套餐限定重置或重置卡。

## 设好字号，放到托盘继续看

![语言、字号、后台运行和开机启动设置](docs/assets/feature-settings.png)

界面可切换中英文，信源原帖按原文显示。调整正文字号时，小字一起缩放，大号时间和数字保持尺寸。关闭至托盘后继续监控，也可以随 Windows 启动。

适用当前套餐的定时自动重置预告使用持续通知，点“确认收到”关闭。相近时间的消息合并，跨信源的同类预告也归到一起。

截图使用演示数据。个人额度通过本机官方 Codex 服务读取，设置和缓存保存在本机，具体数据流见 [隐私说明](PRIVACY.md)。

## 从源码运行

使用 Windows x64 和 Node.js 24：

```powershell
npm ci
npm test
npm run check
npm run test:ui
npm start
npm run build
```

安装包和便携版输出到 dist/。GitHub Actions 负责检查、构建和发布校验和；GitHub Pages 提供图文介绍页。运行 npm run assets 可用演示数据重新生成六张标注图，需要本机安装 Chrome。

## 许可证与反馈

采用 **GPL-3.0-only**。分发修改版时，按 GPL-3.0 提供对应源码。见 [LICENSE](LICENSE) 和 [依赖声明](NOTICE.md)。

遇到问题可以在 [Issues](https://github.com/zzy2670/codex-reset-forecast-dashboard/issues) 留下版本、复现步骤和报错信息。
