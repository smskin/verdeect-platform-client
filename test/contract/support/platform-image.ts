// Образ и коммит Platform для слоя C (prd.md D10, §7 п. 4, п. 9): сборка ../verdeect-platform
// (docker build --target production) или готовый PLATFORM_IMAGE; коммит — для отчёта прогона.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Корень репозитория verdeect-platform рядом с этим репозиторием. */
export const PLATFORM_REPO = fileURLToPath(
    new URL('../../../../verdeect-platform', import.meta.url),
);

/** Тег образа, собранного из ../verdeect-platform. */
const BUILT_IMAGE = 'verdeect-platform:contract';

/** Предел сборки образа (§7 п. 9): globalSetup Vitest таймаутом не ограничен. */
const BUILD_TIMEOUT_MS = 900_000;

/** Сколько последних строк вывода показывать при сбое (п. 9). */
export const TAIL_LINES = 200;

/** Образ стенда и его происхождение. */
export interface PlatformImage {
    readonly image: string;
    readonly commit: string;
    readonly source: string;
    readonly dirty: boolean | 'unknown';
}

/** Итог дочернего процесса. */
export interface ProcessResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}

/** Параметры {@link runProcess}. */
export interface ProcessOptions {
    /** Переменные поверх process.env. */
    readonly env?: Readonly<Record<string, string>>;
    /** Предел, мс; по истечении процесс убивается, код — 124. */
    readonly timeoutMs?: number;
    /** Дублировать вывод в stdout теста. */
    readonly echo?: boolean;
}

/** Последние lines строк текста. */
export function tail(text: string, lines = TAIL_LINES): string {
    return text.split('\n').slice(-lines).join('\n');
}

/** Запуск без shell: аргументы не разбираются оболочкой, секреты передаются через env. */
export function runProcess(
    command: string,
    args: readonly string[],
    options: ProcessOptions = {},
): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, [...args], {
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer =
            options.timeoutMs === undefined
                ? undefined
                : setTimeout(() => {
                      timedOut = true;
                      child.kill('SIGKILL');
                  }, options.timeoutMs);
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
            if (options.echo === true) {
                process.stdout.write(chunk);
            }
        });
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
            if (options.echo === true) {
                process.stdout.write(chunk);
            }
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code: timedOut ? 124 : (code ?? 1), stdout, stderr });
        });
    });
}

async function git(args: readonly string[]): Promise<string> {
    const result = await runProcess('git', ['-C', PLATFORM_REPO, ...args]);
    if (result.code !== 0) {
        throw new Error(`[contract] git ${args.join(' ')}: код ${result.code}\n${result.stderr}`);
    }

    return result.stdout.trim();
}

function fromEnv(name: string): string | undefined {
    const value = process.env[name]?.trim();

    return value === undefined || value === '' ? undefined : value;
}

/** PLATFORM_IMAGE — как есть; иначе сборка ../verdeect-platform. Пустая строка = не задано (Makefile). */
export async function resolvePlatformImage(): Promise<PlatformImage> {
    const external = fromEnv('PLATFORM_IMAGE');
    if (external !== undefined) {
        const commit = fromEnv('PLATFORM_COMMIT');
        console.info(`[contract] образ: PLATFORM_IMAGE=${external}`);
        if (commit === undefined) {
            console.warn(
                '[contract] WARN PLATFORM_COMMIT не задан: коммит Platform unknown, выпуск по этому прогону не допускается (docs/releasing.md)',
            );
        }

        return {
            image: external,
            commit: commit ?? 'unknown',
            source: `PLATFORM_IMAGE=${external}`,
            dirty: 'unknown',
        };
    }

    if (!existsSync(PLATFORM_REPO)) {
        throw new Error(
            `[contract] нет ${PLATFORM_REPO}: склонируйте verdeect-platform рядом с этим репозиторием или задайте PLATFORM_IMAGE`,
        );
    }
    const commit = await git(['rev-parse', 'HEAD']);
    const dirty = (await git(['status', '--porcelain'])) !== '';
    const args = ['build', '--target', 'production', '-t', BUILT_IMAGE, PLATFORM_REPO];
    console.info(
        `[contract] сборка образа: docker ${args.join(' ')} (коммит ${commit}, dirty: ${dirty ? 'yes' : 'no'})`,
    );
    const startedAt = Date.now();
    const result = await runProcess('docker', args, { echo: true, timeoutMs: BUILD_TIMEOUT_MS });
    if (result.code !== 0) {
        throw new Error(
            `[contract] docker build: код ${result.code}${result.code === 124 ? ` (предел ${BUILD_TIMEOUT_MS / 1000} с)` : ''}\n${tail(result.stdout + result.stderr)}`,
        );
    }
    console.info(
        `[contract] образ ${BUILT_IMAGE} собран за ${Math.round((Date.now() - startedAt) / 1000)} с`,
    );

    return { image: BUILT_IMAGE, commit, source: `build ${PLATFORM_REPO}`, dirty };
}
