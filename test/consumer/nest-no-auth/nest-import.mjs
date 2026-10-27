// Подпуть nest без @verdeect/auth (AC-12, NFR-4): импорт падает с ошибкой разрешения модуля.
try {
    await import('@verdeect/platform-client/nest');
    console.log('ok');
} catch (error) {
    console.log(`${error?.code ?? 'NO_CODE'} ${error?.message ?? String(error)}`);
}
