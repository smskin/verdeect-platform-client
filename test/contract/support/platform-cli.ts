// CLI Platform из теста (prd.md §7 п. 7, п. 9, AC-13, AC-14): member:grant / member:revoke через
// docker exec в контейнере сервиса; хвост docker logs сервиса для сообщений о сбое.
import { runProcess, tail, TAIL_LINES } from './platform-image.js';

/** CLI поднимает полный контекст Nest с БД на каждый вызов — предел шире 5 с §7 п. 7. */
const EXEC_TIMEOUT_MS = 30_000;

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
    console.info(
        `[contract] cli ${args.join(' ')}: код ${result.code}, ${payload.ok === true ? 'ok' : `ошибка ${String(payload.error?.code ?? 'нет JSON')}`}`,
    );
    if (result.code !== 0 || payload.ok !== true) {
        throw new Error(
            `[contract] ${args.join(' ')}: код ${result.code}, ${String(payload.error?.code ?? 'нет JSON')}\n` +
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
