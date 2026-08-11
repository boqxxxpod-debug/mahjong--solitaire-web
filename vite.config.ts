import { defineConfig } from 'vite';

export default defineConfig({
  // Keep production assets relative so the build works below the repository
  // path used by GitHub Pages as well as at a local preview URL.
  base: './',
});
