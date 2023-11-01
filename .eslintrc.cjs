module.exports = {
  root: true,
  ignorePatterns: ['**/node_modules/**', '**/dist/**'],
  parser: '@typescript-eslint/parser',
  extends: ['prettier'],
  plugins: ['prettier', '@typescript-eslint'],
  parserOptions: { "project": ["./tsconfig.json"] },
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 80,
        tabWidth: 2,
        semi: false,
      },
    ],
  },
}
