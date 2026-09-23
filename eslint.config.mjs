import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([...next, ...ts, { rules: { 'react-hooks/set-state-in-effect': 'off' } }, globalIgnores(['.next/**','node_modules/**','work/**','next-env.d.ts'])]);
