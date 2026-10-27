// Упаковка для проверок пакета (AC-12, prd.md §4): .tgz из dist/ во временном каталоге вне репозитория; запуск команд без shell.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Меньше testTimeout/hookTimeout (300 с): зависший процесс убивается вместе с упавшим тестом.
const COMMAND_TIMEOUT_MS = 280_000;

/** Корень репозитория пакета. */
export const REPO_ROOT = resolve(import.meta.dirname, '../../..');

/** Результат команды без исключения при ненулевом коде. */
export interface CommandResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}

interface ExecFailure {
    readonly code?: number | string;
    readonly stdout?: string;
    readonly stderr?: string;
}

/** Запускает команду и возвращает код, stdout и stderr. */
export async function runCommand(
    command: string,
    args: readonly string[],
    cwd: string,
): Promise<CommandResult> {
    console.info(`[package-check] ${command} ${args.join(' ')} (cwd: ${cwd})`);
    try {
        const { stdout, stderr } = await execFileAsync(command, args, {
            cwd,
            env: process.env,
            maxBuffer: 64 * 1024 * 1024,
            timeout: COMMAND_TIMEOUT_MS,
            killSignal: 'SIGKILL',
        });
        return { code: 0, stdout, stderr };
    } catch (error) {
        const failure = error as ExecFailure;
        return {
            code: typeof failure.code === 'number' ? failure.code : 1,
            stdout: failure.stdout ?? '',
            stderr: failure.stderr ?? String(error),
        };
    }
}

/** Как runCommand, но ненулевой код — исключение с командой, кодом, stdout и stderr. */
export async function runOrThrow(
    command: string,
    args: readonly string[],
    cwd: string,
): Promise<CommandResult> {
    const result = await runCommand(command, args, cwd);
    if (result.code !== 0) {
        throw new Error(
            `[package-check] ${command} ${args.join(' ')} failed with code ${result.code}:\n` +
                `${result.stdout}\n${result.stderr}`,
        );
    }
    return result;
}

/** Упаковывает пакет в новый временный каталог и возвращает абсолютный путь к .tgz. */
export async function packTarball(): Promise<string> {
    if (!existsSync(join(REPO_ROOT, 'dist', 'core', 'index.js'))) {
        throw new Error('[package-check] dist/ не найден: сначала make build');
    }
    const destination = await mkdtemp(join(tmpdir(), 'verdeect-platform-client-pack-'));
    const { stdout } = await runOrThrow(
        'pnpm',
        ['pack', '--pack-destination', destination],
        REPO_ROOT,
    );
    const tarball = stdout
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.endsWith('.tgz'));
    if (tarball === undefined) {
        throw new Error(`[package-check] pnpm pack printed no .tgz path:\n${stdout}`);
    }
    return resolve(destination, tarball);
}

/** Удаляет временный каталог архива, созданный packTarball. */
export async function removeTarball(tarball: string | undefined): Promise<void> {
    if (tarball === undefined) {
        return;
    }
    await rm(dirname(tarball), { recursive: true, force: true });
}
