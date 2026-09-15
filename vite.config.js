import { defineConfig } from 'vite';
export default defineConfig({
 root:'web',publicDir:false,
 server:{host:'127.0.0.1',port:8766,strictPort:true,forwardConsole:false,proxy:{
  '/api':{target:'http://127.0.0.1:35511',changeOrigin:false},
  '/samples':{target:'http://127.0.0.1:35511',changeOrigin:false},
  '/data':{target:'http://127.0.0.1:35511',changeOrigin:false}
 }},
 build:{assetsInlineLimit:0,outDir:'../dist',emptyOutDir:true,rollupOptions:{input:{app:'web/index.html',method:'web/method.html'}}}
});
