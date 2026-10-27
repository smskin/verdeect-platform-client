// Записывающие logger и metrics слоя U; реестр логов проверяется setup.ts на секреты (AC-19).
import type { PlatformClientLogger, PlatformClientMetrics } from '../../../src/core/types.js';

export interface LogEntry {
    readonly level: 'debug' | 'warn' | 'error';
    readonly obj: object;
    readonly msg: string | undefined;
}

export interface RecordingLogger {
    readonly logger: PlatformClientLogger;
    readonly entries: LogEntry[];
    messages(level: LogEntry['level']): string[];
}

const registry: LogEntry[][] = [];

export function recordedLogEntries(): LogEntry[][] {
    return registry;
}

export function resetRecordedLogs(): void {
    registry.length = 0;
}

export function createRecordingLogger(): RecordingLogger {
    const entries: LogEntry[] = [];
    registry.push(entries);
    const write =
        (level: LogEntry['level']) =>
        (obj: object, msg?: string): void => {
            entries.push({ level, obj, msg });
        };
    return {
        logger: { debug: write('debug'), warn: write('warn'), error: write('error') },
        entries,
        messages: (level) => entries.filter((e) => e.level === level).map((e) => e.msg ?? ''),
    };
}

export interface MetricCall {
    readonly method: 'cacheResult' | 'request' | 'policyEvent';
    readonly args: readonly unknown[];
}

export interface RecordingMetrics {
    readonly metrics: PlatformClientMetrics;
    readonly calls: MetricCall[];
    requests(): Array<readonly [string, string, number]>;
}

export function createRecordingMetrics(): RecordingMetrics {
    const calls: MetricCall[] = [];
    return {
        metrics: {
            cacheResult: (...args) => calls.push({ method: 'cacheResult', args }),
            request: (...args) => calls.push({ method: 'request', args }),
            policyEvent: (...args) => calls.push({ method: 'policyEvent', args }),
        },
        calls,
        requests: () =>
            calls
                .filter((c) => c.method === 'request')
                .map((c) => c.args as unknown as readonly [string, string, number]),
    };
}
