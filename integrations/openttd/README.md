# OpenTTD 大肥鱼直播

安装的是官方 OpenTTD 15.3 Windows x64 ZIP 及 OpenGFX 8.0，存放在 `D:/dafeiyu/OpenTTD/openttd-15.3-windows-win64`。许可证随发行包保留，下载来自 https://www.openttd.org/downloads/openttd-releases/latest ，安装时已核对官方 SHA256。

双击 `D:/dafeiyu/启动OpenTTD直播.cmd`，或操作台 http://127.0.0.1:8787/admin → OpenTTD 游戏直播 → 启动游戏，让大肥鱼玩。

本机固定策略脚本 WhaleTransit 自动在城市道路修建公交站、购买公交并设往返订单，当前最多经营四条城市线路。游戏中的金额、车辆及车站数由 OpenTTD 脚本真实回传。主播空闲时按照原自动开局计时切换进游戏，播报实际经营数据。这里的自动游玩属于固定程序策略，不是语言模型任意控制全游戏。

观众可发“暂停经营”“继续经营”，经过间隔限制后执行。其他路线建议供聊天讨论；铁路、机场、港口目前需手动经营，未接入弹幕自动建设。

结束本局会总结、保存并退出，下一次从 `save/dafeiyu-live.sav` 继续运输公司。不要最小化原生游戏窗口，否则直播抓图会暂时不可用；可以让其他窗口遮挡。当前音乐沿用直播间点歌，游戏音效和音乐关闭。

原生游戏客户端作为旁观者连接本机专用服务，画面经 Windows PrintWindow 抓取并显示在直播页。服务端仅绑定 127.0.0.1:3979，控制端口 3980 使用每次启动随机密码；抓图仅绑定 127.0.0.1:8867。无需开放公网端口。

程序日志为 `live.log`，直播服务日志为项目 `data/openttd-server.log`。`ai/WhaleTransit` 是自动经营脚本源码；直播适配在 `lib/openttd.mjs`、`lib/openttd-director.mjs` 和 `tools/openttd-capture.py`。抓图使用现有本机 Python 加 Pillow。

Mindustry 原游戏和运行目录已从工作目录删除到 Windows 回收站。迁移前直播配置和代码快照留在 `data/backups/openttd-migration-20261113`，其中配置含本机凭据，请勿公开上传。
