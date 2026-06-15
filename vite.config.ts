import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleRegisterRequest } from './scripts/registration-api.mjs';
import { handleReportReminderTestRequest, handleInboundEmailRequest, handleConfirmSubmissionRequest } from './scripts/report-reminder-api.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
  const pocketbaseUrl = env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
  return {
    server: {
      port: 4173,
      host: '0.0.0.0',
    },
    plugins: [
      {
        name: 'aurora-registration-api',
        configureServer(server) {
          server.middlewares.use('/api/register', async (req, res, next) => {
            if (req.method !== 'POST') {
              next();
              return;
            }
            await handleRegisterRequest(req, res);
          });
          server.middlewares.use('/api/report-reminders/test', async (req, res, next) => {
            if (req.method !== 'POST') {
              next();
              return;
            }
            await handleReportReminderTestRequest(req, res);
          });
          server.middlewares.use('/api/emails/inbound', async (req, res, next) => {
            if (req.method !== 'POST') {
              next();
              return;
            }
            await handleInboundEmailRequest(req, res);
          });
          server.middlewares.use('/api/report-reminders/confirm-submission', async (req, res, next) => {
            if (req.method !== 'POST') {
              next();
              return;
            }
            await handleConfirmSubmissionRequest(req, res);
          });
        },
      },
      react(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_POCKETBASE_URL': JSON.stringify(pocketbaseUrl),
    },
    build: {
      chunkSizeWarningLimit: 800,
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'pdf-vendor';
            }

            if (id.includes('recharts')) {
              return 'chart-vendor';
            }

            if (id.includes('qrcode')) {
              return 'qrcode-vendor';
            }

            if (id.includes('docxtemplater') || id.includes('pizzip')) {
              return 'docx-vendor';
            }

            if (id.includes('react-router')) {
              return 'router-vendor';
            }

            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }

            if (id.includes('lucide-react')) {
              return 'icon-vendor';
            }

            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
