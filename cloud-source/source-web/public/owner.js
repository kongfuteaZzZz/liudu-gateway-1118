const $=s=>document.querySelector(s),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value==null?'—':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(value);
let generation=0;
async function refresh(){
 const current=++generation;
 const button=$('#ownerRefresh');button.disabled=true;$('#ownerStatus').textContent='正在读取最新分配…';$('#ownerError').hidden=true;
 // Clear the previous private result before verifying the current session again.
 $('#ownerReport').hidden=true;$('#ownerTable').replaceChildren();$('#ownerSummary').textContent='';
 try{
  const r=await fetch('/api/allocations',{cache:'no-store'}),data=await r.json();
  if(current!==generation||document.visibilityState==='hidden')return;
  if(!r.ok)throw Error(data.error||'查询失败，请稍后重试');
  const submitted=data.participants.filter(p=>p.values!==null).length;
  $('#ownerSummary').textContent=`${data.participants.length} 位评分人 · ${submitted} 人已提交 · ${data.targets.length} 个头像`;
  $('#ownerTable').innerHTML='<caption>当前生效方案，包含所有公开和隐藏分配</caption><thead><tr><th scope="col">评分人</th><th scope="col">状态与时间</th>'+data.targets.map((t,i)=>`<th scope="col"><img src="${escape(t.image)}" alt="第${i+1}个被评分头像"></th>`).join('')+'</tr></thead><tbody>'+data.participants.map(p=>`<tr><th scope="row">${escape(p.name)}</th><td class="owner-info"><strong>${p.values===null?(p.registered?'已注册 · 未提交':'未注册 · 未提交'):(p.visibility==='hidden'?'隐藏':'公开')}</strong>${p.values!==null?`${p.timeKind==='submission'?'分配时间':'旧记录时间'}<br>${time(p.allocationAt)}`:'未提交不计入均分分母'}</td>`+data.targets.map(t=>{const value=p.values===null?null:(p.values[t.id]??0);return `<td class="${value>0?'owner-positive':'owner-zero'}">${value===null?'—':escape(value)}</td>`;}).join('')+'</tr>').join('')+'</tbody>';
  $('#ownerReport').hidden=false;$('#ownerStatus').textContent='已更新：'+time(data.capturedAt)+'（北京时间）';
 }catch(error){if(current===generation){$('#ownerErrorText').textContent=error.message;$('#ownerError').hidden=false;$('#ownerStatus').textContent='未能读取分配明细';}}
 finally{if(current===generation)button.disabled=false;}
}
$('#ownerRefresh').onclick=refresh;
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){generation++;$('#ownerReport').hidden=true;$('#ownerTable').replaceChildren();$('#ownerSummary').textContent='';}else refresh();});
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
await refresh();
