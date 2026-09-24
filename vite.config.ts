import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const targetUrl = env.VITE_API_BASE_URL || 'https://hiapi.websoupcloud.it';
  const isWebsoup = targetUrl.includes('websoupcloud');
  // websoup e il Laravel locale (apiPrefix='') servono le route SENZA prefisso /api,
  // quindi va tolto in fase di proxy; la produzione hiconsole.hisolution.it/api lo mantiene.
  const isLocal = /localhost|127\.0\.0\.1/.test(targetUrl);
  const stripApiPrefix = isWebsoup || isLocal;

  // Fallback pubblici (URL progetto + chiave anon, protetti da RLS) per build senza .env
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://hcllvyzhefcqftesahnv.supabase.co';
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbGx2eXpoZWZjcWZ0ZXNhaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MzUyMTUsImV4cCI6MjA2NzExMTIxNX0.wzDcO5RkVKQXSMBftT8oGvv4SRG7wjeJr87DQwWh4zc';
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID || 'hcllvyzhefcqftesahnv';

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(supabaseProjectId),
    },
    server: {
      host: "::",
      port: 8080,
      proxy: {
        '/api': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => stripApiPrefix ? path.replace(/^\/api/, '') : path
        },
        '/sanctum': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
