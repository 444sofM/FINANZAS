require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startNotificationScheduler, getNotificacionesDia } = require('./notifications');
const authMiddleware = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// En desarrollo: acepta localhost. En producción: acepta FRONTEND_URL de Railway.
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,          // URL de Vercel
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, curl, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // En desarrollo permisivo; en producción rechaza
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error(`CORS bloqueado para: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/transacciones', require('./routes/transacciones'));
app.use('/api/categorias',    require('./routes/categorias'));
app.use('/api/metas',         require('./routes/metas'));
app.use('/api/presupuestos',  require('./routes/presupuestos'));

// Notificaciones del día
app.get('/api/notificaciones/hoy', authMiddleware, (req, res) => {
  const info = getNotificacionesDia(req.userId);
  res.json(info);
});

// Health check — Railway lo usa para saber que el servicio está vivo
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
startNotificationScheduler();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API de Finanzas Personales lista`);
});
