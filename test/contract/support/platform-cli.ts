// CLI Platform из теста (prd.md §7 п. 7, п. 9, AC-13, AC-14): member:grant / member:revoke через
// docker exec в контейнере сервиса; хвост docker logs сервиса для сообщений о сбое.
import { runProcess, tail, TAIL_LINES } from './platform-image.js';

/**
 * CLI поднимает полный контекст Nest с БД на каждый вызов — предел шире 5 с §7 п. 7. Старт под нагрузкой
 * хоста — до ~35 с (Platform PL-03), большая часть уходит на загрузку модулей до Nest.
 */
const DEFAULT_CLI_TIMEOUT_MS = 120_000;

/** Предел вызова CLI: PLATFORM_CLI_TIMEOUT_MS (целое > 0) или 120 с; иначе ошибка конфигурации. */
export function cliTimeoutMs(): number {
    const raw = process.env.PLATFORM_CLI_TIMEOUT_MS?.trim() ?? '';
    if (raw === '') {
        return DEFAULT_CLI_TIMEOUT_MS;
    }
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new Error(
            `[contract] PLATFORM_CLI_TIMEOUT_MS=${raw}: нужно целое число миллисекунд > 0`,
        );
    }

    return Number(raw);
}

const EXEC_TIMEOUT_MS = cliTimeoutMs();

/** Ответ member:grant / member:revoke при ok: true. */
export interface MemberRoleResult {
    readonly changed?: boolean;
    /** Эпоха компании после изменения; null — роль не изменилась. */
    readonly epoch?: number | null;
    readonly [key: string]: unknown;
}

/** Последние lines строк docker logs контейнера (stdout и stderr). */
export async function serviceLogsTail(containerId: string, lines = TAIL_LINES): Promise<string> {
    const result = await runProcess('docker', ['logs', '--tail', String(lines), containerId]);

    return tail(result.stdout + result.stderr, lines);
}

async function memberRole(
    containerId: string,
    command: 'member:grant' | 'member:revoke',
    tenant: string,
    sub: string,
    role: string,
): Promise<MemberRoleResult> {
    const args = [command, '--tenant', tenant, '--sub', sub, '--role', role];
    const result = await runProcess(
        'docker',
        ['exec', containerId, 'node', 'dist/cli.js', ...args],
        { timeoutMs: EXEC_TIMEOUT_MS },
    );
    const last = result.stdout.trim().split('\n').at(-1) ?? '';
    let parsed: unknown;
    try {
        parsed = JSON.parse(last);
    } catch {
        parsed = undefined;
    }
    const payload = (parsed ?? {}) as { ok?: unknown; error?: { code?: unknown } };
    // 124 — runProcess убил docker exec на хосте; node dist/cli.js в контейнере этим не останавливается.
    const outcome =
        result.code === 124
            ? `предел ${EXEC_TIMEOUT_MS} мс истёк, процесс в контейнере мог доработать`
            : `код ${result.code}, ${payload.ok === true ? 'ok' : `ошибка ${String(payload.error?.code ?? 'нет JSON')}`}`;
    console.info(`[contract] cli ${args.join(' ')}: ${outcome}`);
    if (result.code !== 0 || payload.ok !== true) {
        throw new Error(
            `[contract] ${args.join(' ')}: ${outcome}\n` +
                `--- stdout ---\n${tail(result.stdout)}\n--- stderr ---\n${tail(result.stderr)}\n` +
                `--- docker logs сервиса ---\n${await serviceLogsTail(containerId)}`,
        );
    }

    return payload as MemberRoleResult;
}

/** member:grant --tenant <slug> --sub <sub> --role <role>. */
export function memberGrant(
    containerId: string,
    tenant: string,
    sub: string,
    role: string,
): Promise<MemberRoleResult> {
    return memberRole(containerId, 'member:grant', tenant, sub, role);
}

/** member:revoke --tenant <slug> --sub <sub> --role <role>. */
export function memberRevoke(
    containerId: string,
    tenant: string,
    sub: string,
    role: string,
): Promise<MemberRoleResult> {
    return memberRole(containerId, 'member:revoke', tenant, sub, role);
}
