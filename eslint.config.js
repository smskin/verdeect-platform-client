// Flat config пакета @verdeect/platform-client (.ai-factory/rules/base.md, ARCHITECTURE.md — правила зависимостей, TSDoc публичного API).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            'coverage/**',
            'requirements/**',
            '.ai-factory/**',
            '.claude/**',
            '.serena/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            curly: ['error', 'all'],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        // Без этих опций consistent-type-imports требует `import type` для классов-токенов DI Nest,
        // и метаданные декораторов теряют ссылку на класс.
        files: ['src/**/*.ts', 'test/**/*.ts', 'vitest*.config.ts'],
        languageOptions: {
            globals: globals.node,
            parserOptions: {
                emitDecoratorMetadata: true,
                experimentalDecorators: true,
            },
        },
    },
    {
        // TSDoc у каждого экспорта src/ и у публичных членов экспортируемых интерфейсов и классов.
        // Линтер не видит реэкспорт в index.ts, поэтому документируются и внутренние экспорты.
        files: ['src/**/*.ts'],
        plugins: { jsdoc },
        rules: {
            'jsdoc/require-jsdoc': [
                'error',
                {
                    publicOnly: true,
                    exemptEmptyConstructors: true,
                    require: {
                        FunctionDeclaration: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: false,
                        MethodDefinition: false,
                    },
                    contexts: [
                        'TSInterfaceDeclaration',
                        'TSTypeAliasDeclaration',
                        // Только члены интерфейсов: поля литералов в приведениях и союзах документирует сам тип.
                        'TSInterfaceBody > TSPropertySignature',
                        'TSInterfaceBody > TSMethodSignature',
                        'ExportNamedDeclaration > VariableDeclaration',
                        'MethodDefinition:not([accessibility="private"]):not([kind="constructor"])',
                        'TSParameterProperty:not([accessibility="private"])',
                    ],
                },
            ],
        },
    },
    {
        // Копия verdeect-platform decision-codes.ts (AC-11): не правится, поэтому TSDoc не требуется.
        files: ['src/core/codes.ts'],
        rules: { 'jsdoc/require-jsdoc': 'off' },
    },
    {
        // Ядро без Nest и без подпутей nest/testing (ARCHITECTURE.md, D2).
        files: ['src/core/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@nestjs/*', 'rxjs', 'reflect-metadata'],
                            message: 'Ядро не зависит от NestJS (D2).',
                        },
                        {
                            group: ['@verdeect/auth', '@verdeect/auth/*'],
                            message:
                                'Ядро принимает Subject, Principal сопоставляется в src/nest (D2).',
                        },
                        {
                            group: [
                                '../nest/*',
                                '../testing/*',
                                '@verdeect/platform-client',
                                '@verdeect/platform-client/*',
                            ],
                            message: 'Ядро не импортирует nest и testing (ARCHITECTURE.md).',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/nest/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['../testing/*'],
                            message: 'nest не импортирует testing (ARCHITECTURE.md).',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['*.js', '*.mjs', 'scripts/**/*.mjs'],
        languageOptions: { globals: globals.node },
    },
    prettier,
];
