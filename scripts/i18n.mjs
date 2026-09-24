// Compiles messages/<locale>.json into src/lib/paraglide outside Vite.
import { compile } from '@inlang/paraglide-js';

import options from '../paraglide.config.js';

await compile(options);
