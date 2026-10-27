// Конфиг потребителя: только unplugin-swc (метаданные декораторов Nest); условия экспорта не настраиваются (AC-12).
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
});
