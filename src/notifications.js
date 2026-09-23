const cron = require('node-cron');
const { getDb } = require('./database');

const activeTasks = new Map();

function startNotificationScheduler() {
  // Revisar cada minuto si algún usuario necesita notificación
  cron.schedule('* * * * *', () => {
    checkAndNotify();
  });

  console.log('✅ Scheduler de notificaciones iniciado');
}

function checkAndNotify() {
  const db = getDb();
  const now = new Date();
  const horaActual = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const usuarios = db.prepare(`
    SELECT id, nombre, email, notification_time 
    FROM users 
    WHERE notifications_enabled = 1 AND notification_time = ?
  `).all(horaActual);

  if (usuarios.length > 0) {
    usuarios.forEach(user => {
      console.log(`🔔 Notificación para ${user.nombre} (${user.email}): ¡Es hora de registrar tus gastos del día!`);
      // En producción aquí iría el envío de email/push notification
    });
  }
}

// Obtener notificaciones pendientes del día para un usuario
function getNotificacionesDia(userId) {
  const db = getDb();
  const hoy = new Date().toISOString().split('T')[0];

  const tieneRegistroHoy = db.prepare(`
    SELECT COUNT(*) as cantidad 
    FROM transacciones 
    WHERE user_id = ? AND fecha = ? AND tipo = 'egreso'
  `).get(userId, hoy);

  return {
    tiene_registros_hoy: tieneRegistroHoy.cantidad > 0,
    fecha: hoy,
    mensaje: tieneRegistroHoy.cantidad === 0
      ? '¡No has registrado ningún gasto hoy! Recuerda mantener tu registro al día.'
      : `Tienes ${tieneRegistroHoy.cantidad} gasto(s) registrado(s) hoy. ¡Sigue así!`
  };
}

module.exports = { startNotificationScheduler, getNotificacionesDia };
