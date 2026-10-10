import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Also accept the variable names Vercel's Supabase integration creates.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
