// Подпуть testing (AC-12, UC-4 A3, prd.md §4): без условия development — ERR_PACKAGE_PATH_NOT_EXPORTED.
try {
    const testing = await import('@verdeect/platform-client/testing');
    console.log(typeof testing.createFakePlatform === 'function' ? 'ok' : 'no-export');
} catch (error) {
    console.log(error?.code ?? String(error));
}
