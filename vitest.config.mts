import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Dates et heures stables quel que soit le poste qui lance les tests
    env: { TZ: 'Africa/Lubumbashi' },
  },
});
