declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
}

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, options?: string | { encoding?: string; flag?: string }): string;
  export function existsSync(path: string): boolean;
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function readFile(path: string, options?: string | { encoding?: string; flag?: string }): Promise<string>;
  export function writeFile(path: string, data: string | Uint8Array, options?: string | { encoding?: string; flag?: string }): Promise<void>;
  export function stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number; mtimeMs?: number }>;
  export function access(path: string, mode?: number): Promise<void>;
  export function readdir(path: string, options?: { withFileTypes?: boolean }): Promise<any[]>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function copyFile(src: string, dest: string): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function unlink(path: string): Promise<void>;
}

declare module 'node:http' {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, any>): this;
    setHeader(name: string, value: any): this;
    end(data?: any): this;
  }

  export interface Server {
    listen(port: number, host?: string, callback?: () => void): this;
    listen(port: number, callback?: () => void): this;
    close(callback?: () => void): this;
    address(): { port: number; address: string; family: string } | string | null;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export function createServer(requestListener?: (req: IncomingMessage, res: ServerResponse) => void): Server;
  export function get(options: any, callback?: (res: IncomingMessage) => void): any;
  export function request(options: any, callback?: (res: IncomingMessage) => void): any;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
  export function normalize(path: string): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
  export const sep: string;
}

declare module 'node:crypto' {
  export interface Hash {
    update(data: string, inputEncoding?: string): Hash;
    digest(encoding?: string): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:assert' {
  export function equal(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function ok(value: unknown, message?: string | Error): asserts value;
  export function match(value: string, regExp: RegExp, message?: string | Error): void;
  export function doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void;
  export function throws(block: () => unknown, error?: unknown, message?: string | Error): void;
  export function doesNotThrow(block: () => unknown, error?: unknown, message?: string | Error): void;
  export function rejects(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
  export function doesNotReject(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
  export function fail(message?: string | Error): never;

  const assert: {
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): asserts value;
    match(value: string, regExp: RegExp, message?: string | Error): void;
    doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void;
    throws(block: () => unknown, error?: unknown, message?: string | Error): void;
    doesNotThrow(block: () => unknown, error?: unknown, message?: string | Error): void;
    rejects(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
    doesNotReject(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
    fail(message?: string | Error): never;
  };

  export default assert;
}

declare module 'node:assert/strict' {
  export function equal(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function ok(value: unknown, message?: string | Error): asserts value;
  export function match(value: string, regExp: RegExp, message?: string | Error): void;
  export function doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void;
  export function throws(block: () => unknown, error?: unknown, message?: string | Error): void;
  export function doesNotThrow(block: () => unknown, error?: unknown, message?: string | Error): void;
  export function rejects(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
  export function doesNotReject(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
  export function fail(message?: string | Error): never;

  const assert: {
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): asserts value;
    match(value: string, regExp: RegExp, message?: string | Error): void;
    doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void;
    throws(block: () => unknown, error?: unknown, message?: string | Error): void;
    doesNotThrow(block: () => unknown, error?: unknown, message?: string | Error): void;
    rejects(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
    doesNotReject(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
    fail(message?: string | Error): never;
  };

  export default assert;
}

declare module 'node:child_process' {
  export interface ExecException extends Error {
    cmd?: string;
    killed?: boolean;
    code?: number;
    signal?: string;
  }

  export function exec(
    command: string,
    callback?: (error: ExecException | null, stdout: string, stderr: string) => void
  ): any;

  export function exec(
    command: string,
    options: { cwd?: string; env?: Record<string, string | undefined>; timeout?: number; maxBuffer?: number },
    callback?: (error: ExecException | null, stdout: string, stderr: string) => void
  ): any;

  export function execSync(command: string, options?: any): string | Uint8Array;
}

declare module 'node:util' {
  export function promisify<T = any>(fn: Function): (...args: any[]) => Promise<T>;
}

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
    cwd(): string;
    argv: string[];
    exit(code?: number): never;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}

declare const process: NodeJS.Process;

declare class Buffer extends Uint8Array {
  static from(data: any): Buffer;
}

declare module 'node:buffer' {
  export class Buffer extends Uint8Array {
    static from(data: any): Buffer;
  }
}

declare function fetch(input: string | URL, init?: any): Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<any>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

