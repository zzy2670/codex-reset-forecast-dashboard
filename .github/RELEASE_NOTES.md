## Codex 重置预测看板 2.3.2

- 更新桌面运行时及构建依赖，修复依赖安全检查发现的问题。
- 官方完成记录的时间区间及其前后 3 小时归为同一次全局重置，有本机到账记录时采用本机时间；额度耗尽后再次补充单独记录为个人重置卡。原始来源和采样时间可展开查看，右侧醒目显示补充前剩余额度。
- 选择日历日期时默认 12:00，可修改小时后确认。重置卡记录整条以淡黄色显示，并保留原始发卡或使用消息。
- 各额度周期的最后一次有效读数保存在本机。缺失的前值可用该次补充前最后一份可信快照补齐，并显示采样时间；没有可用读数或快照时显示“未记录”。

## English

- Update the desktop runtime and build dependencies to resolve the reported dependency security issues.
- Official completion times define a reset window. Records within that window or three hours on either side are grouped as one global reset, using the local receipt time when available. A later refill after the quota reaches zero is shown as a personal reset-card use. Expand it to view original sources and sampling times; the remaining quota before the refill is highlighted on the right.
- Selecting a calendar date defaults to 12:00, with an editable hour. Reset-card entries have a pale yellow background and retain the original issuance or usage notice.
- The last valid reading from each quota cycle is saved locally. The last trusted snapshot before a refill can fill a missing reading and show its sampling time; entries without a usable reading or snapshot show “Not recorded”.
