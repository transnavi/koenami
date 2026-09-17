// Wrangler bundles .wasm imports as compiled modules; its generated types do not declare them.
declare module '*.wasm' {
	const module: WebAssembly.Module;
	export default module;
}
