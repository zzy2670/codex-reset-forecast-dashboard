'use strict';
function notificationArtwork({width=1600,height=980,social=false,language='zh-CN'}={}){
 let html=`<!doctype html><html lang="${language}"><meta charset="utf-8"><style>
 *{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;background:#101315;color:#f5f6f8;font-family:"Segoe UI","Microsoft YaHei",sans-serif;padding:${social?'60px':'70px'};overflow:hidden}header{display:flex;justify-content:space-between;align-items:center}h1{font-size:${social?'58px':'52px'};line-height:1.3;letter-spacing:-1px;margin:0;font-weight:650}small{font-size:18px;color:#a9b2ba}.sub{font-size:${social?'28px':'26px'};line-height:1.6;color:#c8cdd2;margin:24px 0 40px}.toast{width:${social?'900px':'950px'};margin:${social?'85px':'55px'} auto 35px;padding:38px;border-radius:18px;background:#27282b;border:1px solid #4a4a4e;box-shadow:0 20px 60px #0007}.app{font-size:22px;color:#d4d7da;display:flex;align-items:center;gap:15px}.icon{display:inline-grid;place-items:center;width:38px;height:38px;background:#ff806b;border-radius:10px;color:#171719;font-weight:bold}.close{margin-left:auto;font-size:32px;color:#b7babf}h2{font-size:36px;margin:34px 0 20px}.body{font-size:27px;line-height:1.75;color:#e0e3e6}.receipt{margin-top:32px;text-align:center;font-size:27px;background:#424448;border:1px solid #63656b;border-radius:7px;padding:18px}.notes{display:flex;gap:24px;margin-top:${social?'85px':'52px'}}.notes p{margin:0;padding:24px;border:1px solid #343940;border-radius:14px;font-size:24px;line-height:1.6;flex:1}.notes b{display:block;color:#ff9987;font-size:26px;margin-bottom:8px}.footer{margin-top:35px;color:#a9b2ba;font-size:20px}
 </style><header><h1>重置消息，Windows 自动弹窗</h1><small>通知示意</small></header><p class="sub">带具体时间、适用当前套餐的自动重置预告和完成消息，会触发提醒。</p><section class="toast"><div class="app"><span class="icon">C</span>codex重置预测看板<span class="close">×</span></div><h2>重置预告更新</h2><div class="body">重置时间：10月11日 14:00（北京时间）<br>适用范围：PRO<br>已合并 2 个信源的同类消息</div><div class="receipt">确认收到</div></section><div class="notes"><p><b>提醒持续显示</b>点“确认收到”关闭。</p><p><b>同类消息合并</b>相近时间的预告一起提醒。</p></div>${social?'<div class="footer">codex重置预测看板 · 开机启动 · 托盘监控</div>':''}</html>`;
 if(language==='en'){
  const copy=[
   ['重置消息，Windows 自动弹窗','Automatic Windows reset notifications'],
   ['带具体时间、适用当前套餐的自动重置预告和完成消息，会触发提醒。','Timed automatic-reset announcements and confirmations for your plan trigger a notification.'],
   ['通知示意','Notification illustration'],['codex重置预测看板','Codex Reset Forecast Dashboard'],
   ['重置预告更新','Reset announcement updated'],['重置时间：10月11日 14:00（北京时间）','Reset time: October 11, 14:00 (Beijing time)'],
   ['适用范围：PRO','Plan: PRO'],['已合并 2 个信源的同类消息','Related reports from 2 sources grouped'],
   ['提醒持续显示','Stays until acknowledged'],['点“确认收到”关闭。','Click Acknowledge to dismiss.'],
   ['同类消息合并','Related reports grouped'],['相近时间的预告一起提醒。','Announcements with similar times share one alert.'],
   ['确认收到','Acknowledge'],['开机启动','Windows startup'],['托盘监控','Tray monitoring']
  ];
  for(const [zh,en] of copy)html=html.replaceAll(zh,en);
 }
 return html;
}
module.exports={notificationArtwork};
