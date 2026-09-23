const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getDb } = require('../database');

// GET /api/categorias/ingresos
router.get('/ingresos', authMiddleware, (req, res) => {
  const db = getDb();
  const categorias = db.prepare('SELECT * FROM categorias_ingreso WHERE user_id = ? ORDER BY nombre').all(req.userId);
  res.json(categorias);
});

// GET /api/categorias/egresos
router.get('/egresos', authMiddleware, (req, res) => {
  const db = getDb();
  const categorias = db.prepare('SELECT * FROM categorias_egreso WHERE user_id = ? ORDER BY nombre').all(req.userId);
  res.json(categorias);
});

// POST /api/categorias/ingresos
router.post('/ingresos', authMiddleware, (req, res) => {
  const { nombre, icono, color } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  const db = getDb();
  const result = db.prepare('INSERT INTO categorias_ingreso (user_id, nombre, icono, color) VALUES (?, ?, ?, ?)').run(req.userId, nombre, icono || '💰', color || '#10b981');
  const nueva = db.prepare('SELECT * FROM categorias_ingreso WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nueva);
});

// POST /api/categorias/egresos
router.post('/egresos', authMiddleware, (req, res) => {
  const { nombre, icono, color } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  const db = getDb();
  const result = db.prepare('INSERT INTO categorias_egreso (user_id, nombre, icono, color) VALUES (?, ?, ?, ?)').run(req.userId, nombre, icono || '💸', color || '#ef4444');
  const nueva = db.prepare('SELECT * FROM categorias_egreso WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nueva);
});

// PUT /api/categorias/ingresos/:id
router.put('/ingresos/:id', authMiddleware, (req, res) => {
  const { nombre, icono, color } = req.body;
  const db = getDb();
  const existente = db.prepare('SELECT id FROM categorias_ingreso WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existente) return res.status(404).json({ error: 'Categoría no encontrada' });

  db.prepare('UPDATE categorias_ingreso SET nombre = COALESCE(?, nombre), icono = COALESCE(?, icono), color = COALESCE(?, color) WHERE id = ? AND user_id = ?').run(nombre, icono, color, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM categorias_ingreso WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// PUT /api/categorias/egresos/:id
router.put('/egresos/:id', authMiddleware, (req, res) => {
  const { nombre, icono, color } = req.body;
  const db = getDb();
  const existente = db.prepare('SELECT id FROM categorias_egreso WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existente) return res.status(404).json({ error: 'Categoría no encontrada' });

  db.prepare('UPDATE categorias_egreso SET nombre = COALESCE(?, nombre), icono = COALESCE(?, icono), color = COALESCE(?, color) WHERE id = ? AND user_id = ?').run(nombre, icono, color, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM categorias_egreso WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/categorias/ingresos/:id
router.delete('/ingresos/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM categorias_ingreso WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json({ mensaje: 'Categoría eliminada' });
});

// DELETE /api/categorias/egresos/:id
router.delete('/egresos/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM categorias_egreso WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json({ mensaje: 'Categoría eliminada' });
});

module.exports = router;
