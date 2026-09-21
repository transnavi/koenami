import { test as base, expect } from '../fixtures';

export { expect };

export const test = base.extend<{ browserErrors: void }>({
	// An uncaught exception fails a flow even when its last assertion happened to pass.
	browserErrors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await use();
			expect(errors, 'uncaught browser errors').toEqual([]);
		},
		{ auto: true }
	]
});
