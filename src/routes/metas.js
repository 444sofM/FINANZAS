const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getDb } = require('../database');

// GET /api/metas
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const metas = db.prepare('SELECT * FROM metas_ahorro WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(metas);
});

// GET /api/metas/:id
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const meta = db.prepare('SELECT * FROM metas_ahorro WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!meta) return res.status(404).json({ error: 'Meta no encontrada' });
  res.json(meta);
});

// POST /api/metas
router.post('/', authMiddleware, (req, res) => {
  const { nombre, monto_objetivo, fecha_limite, descripcion, color, icono } = req.body;

  if (!nombre || !monto_objetivo) {
    return res.status(400).json({ error: 'Nombre y monto objetivo son requeridos' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO metas_ahorro (user_id, nombre, monto_objetivo, fecha_limite, descripcion, color, icono)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, nombre, monto_objetivo, fecha_limite, descripcion, color || '#6366f1', icono || '🎯');

  const nueva = db.prepare('SELECT * FROM metas_ahorro WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nueva);
});

// PUT /api/metas/:id - actualizar meta
router.put('/:id', authMiddleware, (req, res) => {
  const { nombre, monto_objetivo, monto_actual, fecha_limite, descripcion, color, icono, completada } = req.body;
  const db = getDb();

  const existente = db.prepare('SELECT id FROM metas_ahorro WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existente) return res.status(404).json({ error: 'Meta no encontrada' });

  db.prepare(`
    UPDATE metas_ahorro SET
      nombre = COALESCE(?, nombre),
      monto_objetivo = COALESCE(?, monto_objetivo),
      monto_actual = COALESCE(?, monto_actual),
      fecha_limite = COALESCE(?, fecha_limite),
      descripcion = COALESCE(?, descripcion),
      color = COALESCE(?, color),
      icono = COALESCE(?, icono),
      completada = COALESCE(?, completada)
    WHERE id = ? AND user_id = ?
  `).run(nombre, monto_objetivo, monto_actual, fecha_limite, descripcion, color, icono, completada, req.params.id, req.userId);

  const actualizada = db.prepare('SELECT * FROM metas_ahorro WHERE id = ?').get(req.params.id);
  res.json(actualizada);
});

// PUT /api/metas/:id/abonar - abonar a una meta
router.put('/:id/abonar', authMiddleware, (req, res) => {
  const { monto } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });

  const db = getDb();
  const meta = db.prepare('SELECT * FROM metas_ahorro WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!meta) return res.status(404).json({ error: 'Meta no encontrada' });

  const nuevoMonto = meta.monto_actual + monto;
  const completada = nuevoMonto >= meta.monto_objetivo ? 1 : 0;

  db.prepare('UPDATE metas_ahorro SET monto_actual = ?, completada = ? WHERE id = ?').run(nuevoMonto, completada, req.params.id);

  const actualizada = db.prepare('SELECT * FROM metas_ahorro WHERE id = ?').get(req.params.id);
  res.json(actualizada);
});

// DELETE /api/metas/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM metas_ahorro WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Meta no encontrada' });
  res.json({ mensaje: 'Meta eliminada' });
});

module.exports = router;
