import { defineConfig } from 'vite';

// The production build is deployed to https://scalelabai.ca/staffing/, so built
// and previewed asset URLs need that prefix. The dev server serves from the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/staffing/' : '/',
}));
