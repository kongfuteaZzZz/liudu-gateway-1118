// Server-side timer only; scoring and historical cutoffs remain in the existing site.
export default {
  async scheduled(controller){
    const time=controller.scheduledTime;
    if(!Number.isFinite(time))throw Error('定时触发时间无效');
    const date=new Date(time+8*3600000).toISOString().slice(0,10);
    const cutoff=Date.parse(date+'T23:59:00+08:00');
    const response=await fetch('https://liudu-club-1118.amicablebeam16.chatgpt.site/api/settle',{
      method:'GET',redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw Error('结算接口返回 HTTP '+response.status);
    const data=await response.json();
    if(data.ok!==true||!Array.isArray(data.dates))throw Error('结算接口返回无效结果');
    if(time>=cutoff&&!data.dates.includes(date))throw Error('缺少 '+date+' 的每日结算记录');
    console.log(JSON.stringify({event:'liudu-settlement',scheduledTime:new Date(time).toISOString(),verifiedDate:time>=cutoff?date:null,recordCount:data.dates.length}));
  }
};
