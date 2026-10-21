(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BarOrder=api;})(globalThis,()=>{
 'use strict';
 const defaults=['actual','hypothetical','calendar','theory'];
 function normalize(order){const saved=Array.isArray(order)?[...order]:[];if(saved.includes('hypothetical')&&!saved.includes('calendar'))saved.splice(saved.indexOf('hypothetical')+1,0,'calendar');return [...new Set(saved.filter(id=>defaults.includes(id))),...defaults.filter(id=>!saved.includes(id))];}
 function valid(order){return Array.isArray(order)&&order.length===defaults.length&&new Set(order).size===defaults.length&&order.every(id=>defaults.includes(id));}
 function move(order,id,index){const result=normalize(order).filter(item=>item!==id);if(!defaults.includes(id))return normalize(order);result.splice(Math.max(0,Math.min(result.length,index)),0,id);return result;}
 return {defaults,normalize,valid,move};
});
