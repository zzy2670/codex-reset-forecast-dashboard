'use strict';
const chinese={
 'Routine mode / Accelerated mode':'常规模式 / 加速模式',
 'Routine mode':'常规模式','Accelerated mode':'加速模式',
 'Remaining quota':'剩余额度','Your remaining quota and plan.':'当前剩余额度和套餐。',
 'Reset countdown':'重置倒计时','A timed automatic reset for your plan switches the dashboard to coral orange.':'适用当前套餐的定时自动重置预告，会让看板切换为珊瑚橙。',
 'Quota usage':'额度消耗进度','Usage bars':'消耗横条',
 'Actual usage, an assumed reset cycle and even usage across your personal cycle.':'实际消耗、假设重置周期，以及个人周期的均匀节奏。',
 'Bar order':'横条顺序','Drag this handle to move a bar.':'拖动把手调整横条位置。',
 'Reset interval':'重置间隔','Click to change X. The default is 3 days.':'点击修改 X，默认 3 天。',
 'The red reset pacing line':'红色重置节奏线','One reset time':'一个预告时间','A range of reset times':'多个预告时间',
 'One time, one line':'一个时间，一条线','The line advances with time and reaches 100% at the announced reset.':'红线随时间向右推进，在预告重置时刻到达 100%。',
 'Different times':'时间不同','Two lines bound the red band. The earlier reset is the faster right-hand line.':'两条线之间形成红色范围；右侧的线对应较早的重置时间。',
 'Reset sources':'重置信源','Next reset':'下次重置','Each site’s announced time appears at the top of its card.':'各网站的预告时间显示在卡片顶部。',
 'Announcement details':'公告详情','Expand the source text, publication time and original link.':'展开查看原文、发布时间和原帖链接。',
 'Shared feed':'共用上游','NextReset and TIBO use the same upstream feed.':'NextReset 与 TIBO 共用一个上游。',
 'Reset history':'历史重置记录','Latest reset':'最近一次重置','Expanded history record':'展开的历史记录',
 'Reset time':'重置时间','The latest cross-checked reset and time elapsed since it.':'最近一次已核对的重置，以及距今时长。',
 'Source timestamps':'各站时间','Compare each site’s recorded time and open its original post.':'比较各网站记录的时间，并打开原帖。',
 'Dashboard settings':'看板设置','Language':'语言','English or Chinese.':'中文或英文。',
 'Tray and startup':'托盘与开机启动','Keep monitoring after closing the window; start with Windows.':'关闭窗口后继续监控，也可随 Windows 启动。',
 'Text size':'字号','Body text and smaller labels resize together.':'正文和比正文小的文字同步调整。',
 'Notifications':'通知','Timed automatic-reset alerts stay until acknowledged. Similar times are grouped.':'定时自动重置提醒持续显示，确认后关闭；相近时间的消息合并提醒。'
};
function artworkCopy(text,language){if(!text||language!=='zh-CN')return text;if(!Object.hasOwn(chinese,text))throw new Error('Missing Chinese artwork copy: '+text);return chinese[text];}
module.exports={artworkCopy};
