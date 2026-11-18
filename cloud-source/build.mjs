import fs from 'node:fs';
import path from 'node:path';
const project=process.cwd();
const assets={};
for(const name of ['index.html','style.css','app.js',...Array.from({length:13},(_,i)=>`avatars/${i+1}.png`)]){
 const file=path.join(project,'source-web/public',name),binary=name.endsWith('.png');
 assets['/'+name]={type:binary?'image/png':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8',binary,data:fs.readFileSync(file,binary?'base64':'utf8')};
}
const targets=Array.from({length:13},(_,i)=>({id:String(i+1).padStart(3,'0'),image:`/avatars/${i+1}.png`}));
const generated=`export const ASSETS=${JSON.stringify(assets)};\nexport const INITIAL_TARGETS=${JSON.stringify(targets)};\n`;
fs.writeFileSync('worker/assets.generated.mjs',generated);
const source=fs.readFileSync('worker/index.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
const core=fs.readFileSync('source-web/core.mjs','utf8');
fs.mkdirSync('dist/server',{recursive:true});
// Workers treats named exports as service entrypoints; keep only the handler export.
fs.writeFileSync('dist/server/index.js',(core+'\n'+generated+'\n'+source).replace(/^export (?!default)/gm,''));
console.log('Built cloud worker with 13 avatars and all three pages');
