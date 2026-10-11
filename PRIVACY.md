# Privacy and data handling / 隐私与数据处理

The dashboard has no telemetry, cloud account, quota upload or credential entry. Public-source requests are GET requests to the five providers listed in `app/core.cjs`; no personal quota is attached. Providers can see your IP and normal HTTP metadata. Opening an original post hands its public URL to your browser.

Personal quota uses the official locally installed Codex CLI through its stdio app-server API. The dashboard does not read `auth.json`, tokens, cookies or conversation files. It keeps only quota percentages, cycle lengths, reset timestamps, plan type and usage permission/credit counts. The official Codex service uses your existing sign-in and may communicate with OpenAI to retrieve your account limits.

Settings, public caches, notification groups and sanitized quota are stored locally in `%APPDATA%\Codex Reset Dashboard\dashboard-state.json`. This location stays stable across upgrades, including portable builds. Uninstalling does not delete it. You can delete it after exiting if you want to clear dashboard data; the next launch restores defaults. Start-at-sign-in is configurable and enabled by default.

Public repository contents come from a file whitelist in a separate Git repository. Promotional images are real interface captures using synthetic data in isolated profiles, with no source requests or notifications. Public binaries are built in GitHub Actions from the public checkout. Runtime data, actual quota screenshots, private paths, credentials and local research logs are excluded. The checked-in scanner rejects common secret and personal-path patterns; it is a guard, not a proof against every possible disclosure.

软件不含统计追踪、云端账户、额度上传或凭据输入。对五个信源的请求只获取公开信息，不携带个人额度。网站运营方仍可看到 IP 等普通网络信息；打开原帖会交由你的浏览器访问公开链接。

个人额度通过已安装的官方 Codex CLI 的本机 stdio 服务读取；看板不直接读取认证文件、令牌、Cookie 或对话记录，仅保留必要额度字段。官方服务沿用已有登录，可能访问 OpenAI 获取账户限额。

设置、公开缓存、通知合并记录及筛选后的额度保存在上述本机目录；升级和便携版沿用同一目录，卸载不删除数据。开机启动默认启用，可在设置中关闭。公共仓库采用文件白名单；宣传图只使用隔离环境的虚构演示数据，发行包由 GitHub 的干净构建环境生成。隐私扫描帮助发现常见泄露模式，不宣称覆盖所有可能的泄露。
