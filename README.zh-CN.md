# codex重置预测看板

[English](README.md) · [七语言图文宣传页](https://zzy2670.github.io/codex-reset-forecast-dashboard/) · [下载软件](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest)

将多源 Codex 重置预告、个人额度消耗节奏、公开完成记录放在同一个 Windows 看板中。软件支持中英双语，宣传页支持中、英、日、西、法、德、韩七种语言。社区独立项目，预告仅供参考，不保证准确时间或个人到账。

## 安装

1. 在 [Releases](https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/latest) 下载 Windows 10/11 x64 安装版，双击安装；也可下载免安装便携版。
2. 打开即可监测公开信源，不需要看板账号或 API 密钥。在设置中选择语言、字号、托盘及开机启动。
3. 如需本机个人额度，安装官方 [Codex CLI](https://github.com/openai/codex)：`npm install -g @openai/codex`，然后 `codex login` 登录。重启看板或刷新额度。支持 npm 安装或 PATH 中的 `codex.exe`；仅安装 Codex 桌面软件时不保证识别，API 密钥账户也可能不返回 ChatGPT 额度窗口。

当前发行包未进行代码签名，Windows 可能提示未知发布者；可对照发行页 SHA-256 和公开源码后自行决定运行。便携版设置仍位于 Windows 用户目录。升级保留设置和数据；开机启动默认启用，可以关闭。

## 常规模式与加速模式

![常规黑绿与预告黑橙对照](docs/assets/feature-modes.png)

常规监控采用黑绿色调。新鲜、适用、含具体时间的自动重置预告出现后，切换为黑橙色并显示目标节奏。暗示、未定时消息、过期信息及只有重置卡的消息不触发自动重置加速。

## 额度消耗节奏对比

![三条节奏与拖动排序](docs/assets/feature-pace.png)

实际消耗、假设每 X 天重置（默认 3 天）、个人周期均匀节奏，使用同一百分比尺度比较。横条可拖动排序并保存偏好；全局预告不会修改个人周期。

## 红色“游泳线”

![单线与荧光范围](docs/assets/feature-forecast.png)

红线随时间推进，在预告截止时刻到达 100%。相同时间合为一条线，不同时间形成快慢双线与红色荧光区域。优先使用已校准的上次全局重置作为起点，缺失时使用真实个人周期起点；无可靠起点不画虚构坐标。已过去端点退出“下次预计”，原始范围保留在依据中；到期不代表已完成重置。

## 五源并列，依据可查

![五源及展开依据](docs/assets/feature-sources.png)

支持 Codex Reset、Did Codex Reset、NextReset、TIBO、Codex Reset Today。展示预告、原文、源更新时间及本机获取时间，每 30 秒检查；Did Codex Reset 按限流约 3.5 分钟获取。NextReset 与 TIBO 共用上游，Today 独立性未验证，五个网站不等于五个独立确认。站方模型概率不等于验证过的历史命中率。

## 历史重置与多源比对

![历史及来源佐证](docs/assets/feature-history.png)

历史从北京时间 2026 年 9 月 1 日开始，最新在上。展开每条记录比较各站记录时间、原帖及采集链；共享上游去重，时间分歧明确标示。全局、套餐限定重置与重置卡分开说明。

## 中英双语与本机运行

![双语和后台设置](docs/assets/feature-settings.png)

软件控件可切换中英文，信源原文保留原语言。正文与更小文字同步调整，大号时间与数字保持尺寸。相关且含具体时间的重置消息使用持续 Windows 通知，通过“确认收到”关闭；相近时间跨信源合并，避免重复弹窗。Windows 通知设置与勿扰模式仍会影响显示。关闭至托盘后继续监控。

宣传图为真实界面加标注，全部使用明确标示的虚构演示数据。看板不向信源上传个人额度，不读取认证文件、Cookie 或对话内容；官方本机服务可能访问 OpenAI 读取限额，信源可看到请求 IP。详见 [隐私说明](PRIVACY.md)。

## 从源码构建与许可证

Windows x64 + Node.js 24，依次运行 `npm ci`、`npm test`、`npm run check`、`npm run test:ui`、`npm run build`。产物位于 `dist/`。GitHub Actions 使用干净源码完成检查、双目标打包和校验和发布；不需要额外 AI 密钥。

采用 **GPL-3.0-only**，分发修改版须按许可证提供对应源码。见 [LICENSE](LICENSE)；依赖版权见 [NOTICE.md](NOTICE.md)。提交问题时请勿上传令牌、本机状态文件或真实额度截图。
