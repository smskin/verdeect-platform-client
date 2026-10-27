// Импорт "." и "./nest" упакованного архива (AC-16, prd.md §4): все peer-зависимости проекта full на месте.
try {
    await import('reflect-metadata');
    const core = await import('@verdeect/platform-client');
    const nest = await import('@verdeect/platform-client/nest');
    const ok =
        typeof core.createPlatformAuthzClient === 'function' &&
        typeof nest.PlatformAuthzModule === 'function';
    console.log(ok ? 'ok' : 'no-export');
    process.exitCode = ok ? 0 : 1;
} catch (error) {
    console.log(error?.code ?? String(error));
    process.exitCode = 1;
}
