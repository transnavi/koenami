import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// The studio's modules assign to `window` at module scope, and resolve their locale from the
// page's address: the tests run as the Japanese studio at the site root.
vi.stubGlobal('window', globalThis);
vi.stubGlobal('location', new URL('https://koe.transnavi.jp/'));
