# Privacy and data handling / 隐私与数据处理

The dashboard has no telemetry, cloud account, quota upload or credential entry. Public-source requests are GET requests to the five providers listed in `app/core.cjs`; no personal quota is attached. Providers can see your IP and normal HTTP metadata. Opening an original post hands its public URL to your browser.

Personal quota uses the official bundled Codex runtime through its stdio app-server API. The dashboard does not read `auth.json`, tokens, cookies or conversation files. It keeps only quota percentages, cycle lengths, reset timestamps, plan type and usage permission/credit counts. The official Codex service uses your existing sign-in and may communicate with OpenAI to retrieve your account limits.

Settings, public caches, notification groups and sanitized quota are stored locally in `%APPDATA%\Codex Reset Dashboard\dashboard-state.json`. This location stays stable across upgrades, including portable builds. Uninstalling does not delete it. You can delete it after exiting if you want to clear dashboard data; the next launch restores defaults. Start-at-sign-in is configurable and enabled by default.

The public repository contains application source, documentation and build scripts. GitHub Actions builds release binaries from this source. The repository scanner checks common credential and personal-path patterns.

软件不含统计追踪、云端账户、额度上传或凭据输入。对五个信源的请求只获取公开信息，不携带个人额度。网站运营方仍可看到 IP 等普通网络信息；打开原帖会交由你的浏览器访问公开链接。

个人额度通过内置的官方 Codex 运行程序的本机 stdio 服务读取；看板不直接读取认证文件、令牌、Cookie 或对话记录，仅保留必要额度字段。官方服务沿用已有登录，可能访问 OpenAI 获取账户限额。

设置、公开缓存、通知合并记录及筛选后的额度保存在上述本机目录；升级和便携版沿用同一目录，卸载不删除数据。开机启动默认启用，可在设置中关闭。公开仓库包含应用源码、文档和构建脚本，GitHub Actions 从源码构建发行包。仓库扫描检查常见凭据与个人路径模式。

ChatGPT sign-in opens the official authorization page in your browser. The official Codex process manages authentication locally. For another existing provider, the dashboard uses a separate Codex connection folder under its local data directory. Deployment checks output only version, connection status and an error category.

ChatGPT 登录会在浏览器中打开官方授权页，认证由官方 Codex 程序在本机管理。已有其他提供方配置时，看板在本机数据目录中使用独立的 Codex 连接目录。部署检测仅输出版本、连接状态和错误类别。
