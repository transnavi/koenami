import base from './vite.config.ts';
const proxy = Object.fromEntries(
	['/api', '/samples', '/data'].map((p) => [
		p,
		{ target: 'http://127.0.0.1:35511', changeOrigin: false }
	])
);
export default { ...base, server: { ...base.server, port: 8777, proxy } };
