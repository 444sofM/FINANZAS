const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const authMiddleware = require('../middleware/auth');

// Categorías por defecto para nuevos usuarios
function crearCategoriasDefault(db, userId) {
  const categoriasIngreso = [
    { nombre: 'Salario', icono: '💼', color: '#10b981' },
    { nombre: 'Freelance', icono: '💻', color: '#6366f1' },
    { nombre: 'Inversiones', icono: '📈', color: '#f59e0b' },
    { nombre: 'Ventas', icono: '🛍️', color: '#ec4899' },
    { nombre: 'Otros ingresos', icono: '💰', color: '#14b8a6' },
  ];

  const categoriasEgreso = [
    { nombre: 'Alimentación', icono: '🍽️', color: '#ef4444' },
    { nombre: 'Transporte', icono: '🚗', color: '#f97316' },
    { nombre: 'Vivienda', icono: '🏠', color: '#84cc16' },
    { nombre: 'Salud', icono: '💊', color: '#06b6d4' },
    { nombre: 'Entretenimiento', icono: '🎬', color: '#8b5cf6' },
    { nombre: 'Ropa', icono: '👕', color: '#ec4899' },
    { nombre: 'Educación', icono: '📚', color: '#3b82f6' },
    { nombre: 'Servicios', icono: '💡', color: '#f59e0b' },
    { nombre: 'Otros gastos', icono: '💸', color: '#6b7280' },
  ];

  const stmtIngreso = db.prepare(
    'INSERT INTO categorias_ingreso (user_id, nombre, icono, color) VALUES (?, ?, ?, ?)'
  );
  const stmtEgreso = db.prepare(
    'INSERT INTO categorias_egreso (user_id, nombre, icono, color) VALUES (?, ?, ?, ?)'
  );

  categoriasIngreso.forEach(c => stmtIngreso.run(userId, c.nombre, c.icono, c.color));
  categoriasEgreso.forEach(c => stmtEgreso.run(userId, c.nombre, c.icono, c.color));
}

// POST /api/auth/registro
router.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password, moneda } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const db = getDb();
    const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existente) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (nombre, email, password, moneda) VALUES (?, ?, ?, ?)'
    ).run(nombre, email, hashedPassword, moneda || 'USD');

    crearCategoriasDefault(db, result.lastInsertRowid);

    const token = jwt.sign({ userId: result.lastInsertRowid }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    const user = db.prepare('SELECT id, nombre, email, moneda, notification_time, notifications_enabled, avatar, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const { password: _, ...userSinPassword } = user;
    res.json({ token, user: userSinPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/perfil
router.get('/perfil', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, nombre, email, moneda, notification_time, notifications_enabled, avatar, created_at FROM users WHERE id = ?'
  ).get(req.userId);

  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});

// PUT /api/auth/perfil
router.put('/perfil', authMiddleware, async (req, res) => {
  try {
    const { nombre, moneda, notification_time, notifications_enabled, avatar } = req.body;
    const db = getDb();

    db.prepare(
      'UPDATE users SET nombre = COALESCE(?, nombre), moneda = COALESCE(?, moneda), notification_time = COALESCE(?, notification_time), notifications_enabled = COALESCE(?, notifications_enabled), avatar = COALESCE(?, avatar) WHERE id = ?'
    ).run(nombre, moneda, notification_time, notifications_enabled, avatar, req.userId);

    const user = db.prepare(
      'SELECT id, nombre, email, moneda, notification_time, notifications_enabled, avatar, created_at FROM users WHERE id = ?'
    ).get(req.userId);

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/auth/cambiar-password
router.put('/cambiar-password', authMiddleware, async (req, res) => {
  try {
    const { passwordActual, passwordNueva } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

    const valid = await bcrypt.compare(passwordActual, user.password);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    if (passwordNueva.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const hashed = await bcrypt.hash(passwordNueva, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.userId);

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/auth/cambiar-password
router.put('/cambiar-password', authMiddleware, async (req, res) => {
  try {
    const { passwordActual, passwordNueva } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

    const valid = await bcrypt.compare(passwordActual, user.password);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    if (passwordNueva.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const hashed = await bcrypt.hash(passwordNueva, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.userId);

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/recuperar-password — genera token de recuperación
router.post('/recuperar-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const db = getDb();
    const user = db.prepare('SELECT id, nombre, email FROM users WHERE email = ?').get(email);

    // Responder siempre OK para no revelar si el email existe
    if (!user) {
      return res.json({ mensaje: 'Si el email está registrado, recibirás las instrucciones' });
    }

    // Token de 1 hora firmado con JWT
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'reset-password' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // En producción se enviaría por email. Aquí devolvemos el token
    // para que el frontend pueda redirigir directamente (modo demo/local).
    console.log(`🔑 Token de recuperación para ${user.email}: ${resetToken}`);

    res.json({
      mensaje: 'Si el email está registrado, recibirás las instrucciones',
      // Solo en desarrollo se expone el token para poder probar sin email real
      ...(process.env.NODE_ENV !== 'production' && { reset_token: resetToken }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/resetear-password — establece la nueva contraseña con el token
router.post('/resetear-password', async (req, res) => {
  try {
    const { token, passwordNueva } = req.body;
    if (!token || !passwordNueva) {
      return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
    }
    if (passwordNueva.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    if (payload.purpose !== 'reset-password') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const hashed = await bcrypt.hash(passwordNueva, 10);
    const db = getDb();
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, payload.userId);

    res.json({ mensaje: 'Contraseña restablecida correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/auth/cuenta — elimina la cuenta y todos sus datos
router.delete('/cuenta', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Contraseña requerida para confirmar' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

    // Las FK con ON DELETE CASCADE eliminan transacciones, categorías, metas y presupuestos
    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);

    res.json({ mensaje: 'Cuenta eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
