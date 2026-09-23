const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getDb } = require('../database');

// GET /api/presupuestos
router.get('/', authMiddleware, (req, res) => {
  const { mes, anio } = req.query;
  const mesActual = mes || new Date().getMonth() + 1;
  const anioActual = anio || new Date().getFullYear();
  const mesPad = mesActual.toString().padStart(2, '0');

  const db = getDb();

  const presupuestos = db.prepare(`
    SELECT p.*, ce.nombre as categoria_nombre, ce.icono as categoria_icono, ce.color as categoria_color,
      COALESCE((
        SELECT SUM(t.monto)
        FROM transacciones t
        WHERE t.user_id = p.user_id 
          AND t.categoria_id = p.categoria_id 
          AND t.tipo = 'egreso'
          AND strftime('%m', t.fecha) = ?
          AND strftime('%Y', t.fecha) = ?
      ), 0) as gastado
    FROM presupuestos p
    JOIN categorias_egreso ce ON p.categoria_id = ce.id
    WHERE p.user_id = ? AND p.mes = ? AND p.anio = ?
  `).all(mesPad, anioActual.toString(), req.userId, parseInt(mesActual), parseInt(anioActual));

  res.json(presupuestos);
});

// POST /api/presupuestos
router.post('/', authMiddleware, (req, res) => {
  const { categoria_id, monto_limite, mes, anio } = req.body;
  if (!categoria_id || !monto_limite || !mes || !anio) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  const db = getDb();

  // Verificar si ya existe un presupuesto para esa categoría en ese mes/año
  const existente = db.prepare('SELECT id FROM presupuestos WHERE user_id = ? AND categoria_id = ? AND mes = ? AND anio = ?').get(req.userId, categoria_id, mes, anio);

  if (existente) {
    db.prepare('UPDATE presupuestos SET monto_limite = ? WHERE id = ?').run(monto_limite, existente.id);
    const updated = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(existente.id);
    return res.json(updated);
  }

  const result = db.prepare('INSERT INTO presupuestos (user_id, categoria_id, monto_limite, mes, anio) VALUES (?, ?, ?, ?, ?)').run(req.userId, categoria_id, monto_limite, mes, anio);
  const nuevo = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nuevo);
});

// PUT /api/presupuestos/:id
router.put('/:id', authMiddleware, (req, res) => {
  const { monto_limite } = req.body;
  if (!monto_limite || isNaN(parseFloat(monto_limite))) {
    return res.status(400).json({ error: 'Monto límite requerido' });
  }
  const db = getDb();
  const existente = db.prepare('SELECT id FROM presupuestos WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existente) return res.status(404).json({ error: 'Presupuesto no encontrado' });

  db.prepare('UPDATE presupuestos SET monto_limite = ? WHERE id = ? AND user_id = ?').run(parseFloat(monto_limite), req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/presupuestos/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM presupuestos WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Presupuesto no encontrado' });
  res.json({ mensaje: 'Presupuesto eliminado' });
});

module.exports = router;
