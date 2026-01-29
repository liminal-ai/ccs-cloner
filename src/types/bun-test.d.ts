/**
 * Minimal type declarations for bun:test
 * Avoids @types/bun which brings 66 low-severity vulnerability warnings
 */

declare module "bun:test" {
	export function describe(name: string, fn: () => void): void;
	export function test(name: string, fn: () => void | Promise<void>): void;
	export function expect<T>(value: T): ExpectMatchers<T>;
	export function beforeEach(fn: () => void | Promise<void>): void;
	export function afterEach(fn: () => void | Promise<void>): void;

	interface ExpectMatchers<T> {
		toBe(expected: T): void;
		toEqual(expected: unknown): void;
		toBeDefined(): void;
		toBeUndefined(): void;
		toBeNull(): void;
		toBeTruthy(): void;
		toBeFalsy(): void;
		toBeGreaterThan(expected: number): void;
		toBeGreaterThanOrEqual(expected: number): void;
		toBeLessThan(expected: number): void;
		toBeLessThanOrEqual(expected: number): void;
		toContain(expected: unknown): void;
		toHaveLength(expected: number): void;
		toMatch(expected: RegExp | string): void;
		toMatchObject(expected: object): void;
		toThrow(
			expected?: string | RegExp | Error | (new (...args: any[]) => Error),
		): void;
		toBeInstanceOf(expected: new (...args: any[]) => unknown): void;
		toHaveProperty(key: string, value?: unknown): void;
		resolves: ExpectMatchers<Awaited<T>>;
		rejects: ExpectMatchers<unknown>;
		not: ExpectMatchers<T>;
	}
}
