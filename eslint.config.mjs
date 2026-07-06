// ESLint Flat Config für den React/TypeScript-Quellcode unter src/.
// Die Serverless-Functions (api/, lib/, functions/) sind CommonJS und werden
// hier bewusst nicht gelintet.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'api/**', 'lib/**', 'functions/**', 'scripts/**']
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Die neuen Compiler-Regeln des react-hooks-Plugins melden viele
      // Bestandsmuster. Als Warnungen sichtbar halten, Lint nicht blockieren.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Bestandscode nutzt an einigen Stellen bewusst any (Firestore-Rohdaten).
      // Als Warnung sichtbar halten, aber den Build nicht blockieren.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
      ],
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'always']
    }
  }
)
