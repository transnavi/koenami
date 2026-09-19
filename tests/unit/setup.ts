import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// The studio's modules assign to `window` at module scope.
vi.stubGlobal('window', globalThis);
