import { pmoTestViteRoute } from './src/dev/pmoTestViteRoute';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  if (command === 'build') {
    throw new Error('RESORT_RELEASE_DENIED_UNCLEARED_ASSETS: GLB/SVG redistribution rights and island production admission remain unverified; do not publish existing dist/.');
  }
  return {
  plugins: [pmoTestViteRoute(), react()],
  server: {
    host: '127.0.0.1'
  }
  };
});
