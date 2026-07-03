// Ambient declarations for non-code assets imported for their side effects.
// `import './global.css'` (the Uniwind/Tailwind entry) is processed by Metro, not
// tsc, so TypeScript needs a module declaration for it. Expo provides the same
// declaration via `expo/types`, but that is only wired up through the git-ignored
// `expo-env.d.ts`, which is not generated in the CI typecheck job — so declare it
// here in a tracked file. Keep this in sync with Expo's asset module declarations.
declare module '*.css';
