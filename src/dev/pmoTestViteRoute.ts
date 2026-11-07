import type { Plugin } from 'vite';
/** Only dev route: http://localhost:5173/тест (including percent-encoded form). */
export function pmoTestViteRoute(): Plugin {
  return {
    name:'rrh-pmo-test-buildings-route',
    apply:'serve',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{
        const request = req as typeof req & { url?: string };
        let path='';
        try { path=decodeURIComponent(new URL(request.url||'/', 'http://localhost').pathname); } catch { return next(); }
        // The pathfinding endpoint is NOT the legacy standalone /тест canvas:
        // rewrite to RRH's real index.html so src/main.tsx boots the real App.
        if(path==='/pathfinding-test'||path==='/pathfinding-test/'){
          request.url='/index.html';
          return next();
        }
        if(path!=='/тест'&&path!=='/тест/') return next();
        res.statusCode=200;
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RRH · PMO Тест зданий</title><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#14232d;font:14px system-ui;color:#eef5fb}#app canvas{display:block}.hud{position:absolute;left:16px;top:16px;background:#0b1725dd;padding:12px 16px;border-radius:10px;pointer-events:none;max-width:350px;white-space:pre-line;line-height:1.45}</style></head><body><div id="app"></div><div id="hud" class="hud">PMO /тест — загрузка…</div><script type="module" src="/src/dev/pmoTestPage.ts"></script></body></html>`);
      });
    }
  };
}
