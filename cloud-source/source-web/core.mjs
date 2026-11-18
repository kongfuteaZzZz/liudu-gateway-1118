export const DAY = 86400000;
export const round1 = n => Math.round((n + Number.EPSILON) * 10) / 10;
export const dateCN = t => new Date(t + 8 * 3600000).toISOString().slice(0, 10);
export const cutoff = date => Date.parse(date + 'T23:59:00+08:00');
export function rank(rows, key = 'score') {
  const sorted = [...rows].sort((a,b) => b[key]-a[key] || a.id.localeCompare(b.id));
  let place = 0;
  return sorted.map((x,i) => { if (!i || x[key] !== sorted[i-1][key]) place=i+1; return {...x, rank:place}; });
}
export function board(db, at = Infinity) {
  const latest = new Map();
  for (const v of db.versions) if (v.time <= at) latest.set(v.user, v);
  const votes = [...latest.values()];
  return { count:votes.length, rows:rank(db.targets.filter(t=>t.created<=at).map(t => ({...t, score:round1(votes.length ? votes.reduce((n,v)=>n+(v.values[t.id]||0),0)/votes.length : 0)}))) };
}
export function awards(rows) {
  return rows.filter(r=>r.rank<=3).map(r=>{
    const tied = rows.filter(x=>x.rank===r.rank).length;
    const rewards=[6,3,1]; let pool=0;
    for(let i=r.rank-1;i<r.rank-1+tied;i++) pool+=rewards[i]||0;
    return {id:r.id, image:r.image, rank:r.rank, score:r.score, reward:r.score>0 ? round1(pool/tied) : 0};
  });
}
export function settle(db, now=Date.now()) {
  let changed=false;
  for(let t=cutoff(dateCN(db.created));t<=now;t+=DAY){
    const day=dateCN(t);
    if (!db.days[day]) { const b=board(db,t); db.days[day]={date:day, count:b.count, settledAt:t, rows:awards(b.rows)}; changed=true; }
  }
  return changed;
}
export function totals(db) {
  return rank(db.targets.map(t=>({...t, score:round1(Object.values(db.days).reduce((n,d)=>n+(d.rows.find(r=>r.id===t.id)?.reward||0),0))})));
}
export function validate(values, targets) {
  if (!values || typeof values!=='object' || Array.isArray(values)) throw Error('请填写分配值');
  const ids=new Set(targets.map(t=>t.id));
  for(const [id,n] of Object.entries(values)) if(!ids.has(id)||!Number.isInteger(n)||n<0||n>100) throw Error('分配值必须是 0～100 的整数');
  if(Object.values(values).reduce((a,b)=>a+b,0)!==100) throw Error('必须恰好分配完 100 点才能提交');
}
