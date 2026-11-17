import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

export const UPSTREAM = 'https://liudu-club-1118.amicablebeam16.chatgpt.site';
const LIMIT = 500000;
const API = new Set(['health','settle','login','logout','state','public','profile','submit','visibility','upload']);
const allowed = path => ['/', '/index.html', '/app.js', '/style.css'].includes(path)
  || /^\/avatars\/\d+\.png$/.test(path)
  || (path.startsWith('/api/') && API.has(path.slice(5)));
const session = value => /(?:^|;\s*)(liudu_name_session=[a-f0-9]{64})(?:;|$)/.exec(value || '')?.[1];

export function createGateway({publicOrigin, fetchUpstream = fetch}) {
  const origin = new URL(publicOrigin).origin;
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, origin);
      if (url.origin !== origin || !req.url.startsWith('/') || req.url.startsWith('//')) return send(400, {error:'无效地址'});
      if (!['GET','HEAD','POST'].includes(req.method)) return send(405, {error:'不支持的请求方式'});
      if (req.method === 'GET' && url.pathname === '/gateway-health') return send(200, {ok:true, mode:'gateway'});
      if (!allowed(url.pathname)) return send(404, {error:'接口不存在'});
      if (req.method === 'POST' && req.headers.origin && req.headers.origin !== origin) return send(403, {error:'请求来源不符'});
      if (Number(req.headers['content-length']) > LIMIT) return send(413, {error:'上传内容过大'});
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > LIMIT) return send(413, {error:'上传内容过大'});
        chunks.push(chunk);
      }
      const headers = {'Accept-Encoding':'identity'};
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      const cookie = session(req.headers.cookie);
      if (cookie) headers.Cookie = cookie;
      if (req.method === 'POST') headers.Origin = UPSTREAM;
      // Assign path separately so user input can never replace the destination host.
      const target = new URL(UPSTREAM); target.pathname = url.pathname; target.search = url.search;
      const response = await fetchUpstream(target, {
        method:req.method, headers, body:req.method === 'POST' ? Buffer.concat(chunks) : undefined,
        redirect:'manual', signal:AbortSignal.timeout(20000)
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return send(502, {error:'原网站返回了异常跳转，请稍后重试'});
      }
      res.statusCode = response.status;
      res.setHeader('Cache-Control','no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','same-origin');
      if (response.headers.has('content-type')) res.setHeader('Content-Type',response.headers.get('content-type'));
      const cookies = response.headers.getSetCookie().filter(c => /^liudu_name_session=/.test(c) && !/;\s*domain\s*=/i.test(c));
      if (cookies.length) res.setHeader('Set-Cookie',cookies);
      if (req.method === 'HEAD' || !response.body) res.end();
      else await pipeline(Readable.fromWeb(response.body),res);
    } catch {
      if (res.headersSent) res.destroy();
      else send(502, {error:'暂时无法连接云端，请稍后重试'});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  createGateway({publicOrigin:process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`})
    .listen(port, '0.0.0.0', () => console.log('Liudu gateway listening'));
}
