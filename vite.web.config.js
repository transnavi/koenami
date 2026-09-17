import { defineConfig } from 'vite';
export default defineConfig({
 root:'web',publicDir:'public',
 // The Worker serves /r from result.html; mirror that in development.
 plugins:[{name:'result-route',configureServer(server){server.middlewares.use((req,_res,next)=>{if(req.url==='/r'||req.url.startsWith('/r?'))req.url='/result.html'+req.url.slice(2);next();});}}],
 server:{host:'127.0.0.1',port:8766,strictPort:true,forwardConsole:false,proxy:Object.fromEntries(['/api','/samples','/data'].map(path=>[path,{target:`http://127.0.0.1:${process.env.KOENAMI_API_PORT||35511}`,changeOrigin:false}]))},
 build:{assetsInlineLimit:0,outDir:'../dist',emptyOutDir:true,rollupOptions:{input:{app:'web/index.html',method:'web/method.html',guide:'web/guide.html',tutorial:'web/tutorial.html',references:'web/references.html',result:'web/result.html',review:'web/review.html',pairs:'web/pairs.html'}}}
});
