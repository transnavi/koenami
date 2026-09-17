import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createServer, createLogger } from 'vite';
const redact = (value) =>
	String(value)
		.replaceAll(homedir(), '~')
		.replace(/\/home\/[^/\s]+/g, '/home/<username>');
const logger = createLogger();
for (const method of ['info', 'warn', 'warnOnce', 'error']) {
	const original = logger[method].bind(logger);
	logger[method] = (message, ...args) => original(redact(message), ...args);
}
const backend = spawn('.venv/bin/python', ['server.py', '--port', '35511'], {
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		KOENAMI_PUBLIC: '0',
		KOENAMI_DATA: fileURLToPath(new URL('./data', import.meta.url))
	}
});
for (const output of [backend.stdout, backend.stderr])
	output.on('data', (data) => process.stdout.write(redact(data)));
let vite,
	closing = false;
async function close(code = 0) {
	if (closing) return;
	closing = true;
	await vite?.close();
	backend.kill('SIGTERM');
	process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close());
backend.on('exit', (code) => {
	if (!closing) void close(code || 0);
});
backend.on('error', (error) => {
	console.error(redact(error.message));
	void close(1);
});
try {
	let ready = false;
	// oxlint-disable-next-line no-unmodified-loop-condition -- closing flips in the exit handlers above
	for (let i = 0; i < 100 && !closing; i++) {
		try {
			const response = await fetch('http://127.0.0.1:35511/api/catalog');
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (!ready) throw new Error('Audio API did not start');
	vite = await createServer({ configFile: 'vite.web.config.js', customLogger: logger });
	await vite.listen();
	console.log('Koenami: http://localhost:8766/ja/');
} catch (error) {
	console.error(redact(error.stack || error));
	await close(1);
}
