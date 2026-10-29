// globalSetup слоя C (prd.md §7, D10): образ Platform → стенд → provide адресов, токенов и коммита
// тестам; отчёт «[contract] Platform: <commit>» в начале и после результатов прогона; режим limits (AC-22).
import type { TestProject } from 'vitest/node';
import { cliTimeoutMs } from './platform-cli.js';
import { resolvePlatformImage, type PlatformImage } from './platform-image.js';
import { startPlatformStand } from './platform-stand.js';

function report(image: PlatformImage): string {
    const dirty = image.dirty === 'unknown' ? 'unknown' : image.dirty ? 'yes' : 'no';

    return `[contract] Platform: ${image.commit} (${image.source}), dirty: ${dirty}`;
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    const image = await resolvePlatformImage();
    console.info(report(image));
    console.info(
        `[contract] limits mode: ${process.env.PLATFORM_LIMITS === 'legacy' ? 'legacy' : 'b1'}`,
    );
    console.info(`[contract] предел CLI: ${cliTimeoutMs()} мс`);
    const stand = await startPlatformStand(image);

    project.provide('platformUrl', stand.platformUrl);
    project.provide('amqpUrl', stand.amqpUrl);
    project.provide('serviceContainerId', stand.serviceContainerId);
    project.provide('authzToken', stand.authzToken);
    project.provide('noScopeToken', stand.noScopeToken);
    project.provide('platformCommit', image.commit);

    return async () => {
        await stand.stop();
        console.info(report(image));
    };
}

declare module 'vitest' {
    export interface ProvidedContext {
        /** HTTP Platform с хоста. */
        platformUrl: string;
        /** AMQP брокера стенда с хоста. */
        amqpUrl: string;
        /** id контейнера сервиса Platform (docker exec, docker logs). */
        serviceContainerId: string;
        /** Сервисный токен с platform:authz. */
        authzToken: string;
        /** Сервисный токен того же издателя без области. */
        noScopeToken: string;
        /** Коммит Platform прогона (D10). */
        platformCommit: string;
    }
}
