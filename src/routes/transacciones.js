const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getDb } = require('../database');

// GET /api/transacciones - con filtros
router.get('/', authMiddleware, (req, res) => {
  const { tipo, mes, anio, categoria_id, search, limit = 50, offset = 0 } = req.query;
  const db = getDb();

  let query = `
    SELECT t.*, 
      CASE WHEN t.tipo = 'ingreso' THEN ci.nombre ELSE ce.nombre END as categoria_nombre,
      CASE WHEN t.tipo = 'ingreso' THEN ci.icono ELSE ce.icono END as categoria_icono,
      CASE WHEN t.tipo = 'ingreso' THEN ci.color ELSE ce.color END as categoria_color
    FROM transacciones t
    LEFT JOIN categorias_ingreso ci ON t.tipo = 'ingreso' AND t.categoria_id = ci.id
    LEFT JOIN categorias_egreso ce ON t.tipo = 'egreso' AND t.categoria_id = ce.id
    WHERE t.user_id = ?
  `;
  const params = [req.userId];

  if (tipo) { query += ' AND t.tipo = ?'; params.push(tipo); }
  if (mes) { query += ' AND strftime("%m", t.fecha) = ?'; params.push(mes.toString().padStart(2, '0')); }
  if (anio) { query += ' AND strftime("%Y", t.fecha) = ?'; params.push(anio.toString()); }
  if (categoria_id) { query += ' AND t.categoria_id = ?'; params.push(categoria_id); }
  if (search) {
    query += ` AND (
      t.descripcion LIKE ? OR t.notas LIKE ?
      OR (t.tipo = 'ingreso' AND ci.nombre LIKE ?)
      OR (t.tipo = 'egreso' AND ce.nombre LIKE ?)
    )`;
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  query += ' ORDER BY t.fecha DESC, t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const transacciones = db.prepare(query).all(...params);
  res.json(transacciones);
});

// GET /api/transacciones/exportar - todos los datos para exportar CSV
router.get('/exportar', authMiddleware, (req, res) => {
  const { tipo, mes, anio } = req.query;
  const db = getDb();

  let query = `
    SELECT t.fecha, t.hora, t.tipo, t.monto, t.descripcion, t.notas,
      CASE WHEN t.tipo = 'ingreso' THEN ci.nombre ELSE ce.nombre END as categoria_nombre
    FROM transacciones t
    LEFT JOIN categorias_ingreso ci ON t.tipo = 'ingreso' AND t.categoria_id = ci.id
    LEFT JOIN categorias_egreso ce ON t.tipo = 'egreso' AND t.categoria_id = ce.id
    WHERE t.user_id = ?
  `;
  const params = [req.userId];

  if (tipo) { query += ' AND t.tipo = ?'; params.push(tipo); }
  if (mes) { query += ' AND strftime("%m", t.fecha) = ?'; params.push(mes.toString().padStart(2, '0')); }
  if (anio) { query += ' AND strftime("%Y", t.fecha) = ?'; params.push(anio.toString()); }
  query += ' ORDER BY t.fecha DESC, t.created_at DESC';

  const transacciones = db.prepare(query).all(...params);

  // Generar CSV
  const header = 'Fecha,Hora,Tipo,Monto,Descripcion,Categoria,Notas\n';
  const rows = transacciones.map(t => {
    const escape = (v) => `"${(v || '').toString().replace(/"/g, '""')}"`;
    return [t.fecha, t.hora, t.tipo, t.monto, escape(t.descripcion), escape(t.categoria_nombre), escape(t.notas)].join(',');
  }).join('\n');

  const filename = `finanzas_${anio || 'todos'}_${mes ? mes.toString().padStart(2, '0') : 'todos'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + header + rows); // BOM para Excel
});

// GET /api/transacciones/resumen - resumen del mes
router.get('/resumen', authMiddleware, (req, res) => {
  const { mes, anio } = req.query;
  const db = getDb();

  const mesActual = mes || new Date().getMonth() + 1;
  const anioActual = anio || new Date().getFullYear();
  const mesPad = mesActual.toString().padStart(2, '0');

  const totales = db.prepare(`
    SELECT 
      tipo,
      SUM(monto) as total,
      COUNT(*) as cantidad
    FROM transacciones
    WHERE user_id = ? 
      AND strftime('%m', fecha) = ? 
      AND strftime('%Y', fecha) = ?
    GROUP BY tipo
  `).all(req.userId, mesPad, anioActual.toString());

  const ingresos = totales.find(t => t.tipo === 'ingreso') || { total: 0, cantidad: 0 };
  const egresos = totales.find(t => t.tipo === 'egreso') || { total: 0, cantidad: 0 };

  // Por categoría
  const porCategoriaEgreso = db.prepare(`
    SELECT ce.nombre, ce.icono, ce.color, SUM(t.monto) as total, COUNT(*) as cantidad
    FROM transacciones t
    JOIN categorias_egreso ce ON t.categoria_id = ce.id
    WHERE t.user_id = ? AND t.tipo = 'egreso'
      AND strftime('%m', t.fecha) = ?
      AND strftime('%Y', t.fecha) = ?
    GROUP BY ce.id
    ORDER BY total DESC
  `).all(req.userId, mesPad, anioActual.toString());

  const porCategoriaIngreso = db.prepare(`
    SELECT ci.nombre, ci.icono, ci.color, SUM(t.monto) as total, COUNT(*) as cantidad
    FROM transacciones t
    JOIN categorias_ingreso ci ON t.categoria_id = ci.id
    WHERE t.user_id = ? AND t.tipo = 'ingreso'
      AND strftime('%m', t.fecha) = ?
      AND strftime('%Y', t.fecha) = ?
    GROUP BY ci.id
    ORDER BY total DESC
  `).all(req.userId, mesPad, anioActual.toString());

  // Tendencia diaria del mes
  const tendenciaDiaria = db.prepare(`
    SELECT fecha, tipo, SUM(monto) as total
    FROM transacciones
    WHERE user_id = ?
      AND strftime('%m', fecha) = ?
      AND strftime('%Y', fecha) = ?
    GROUP BY fecha, tipo
    ORDER BY fecha
  `).all(req.userId, mesPad, anioActual.toString());

  res.json({
    ingresos: ingresos.total || 0,
    egresos: egresos.total || 0,
    balance: (ingresos.total || 0) - (egresos.total || 0),
    cantidad_ingresos: ingresos.cantidad || 0,
    cantidad_egresos: egresos.cantidad || 0,
    por_categoria_egreso: porCategoriaEgreso,
    por_categoria_ingreso: porCategoriaIngreso,
    tendencia_diaria: tendenciaDiaria,
  });
});

// GET /api/transacciones/resumen-anual
router.get('/resumen-anual', authMiddleware, (req, res) => {
  const { anio } = req.query;
  const anioActual = anio || new Date().getFullYear();
  const db = getDb();

  const datos = db.prepare(`
    SELECT 
      strftime('%m', fecha) as mes,
      tipo,
      SUM(monto) as total
    FROM transacciones
    WHERE user_id = ? AND strftime('%Y', fecha) = ?
    GROUP BY mes, tipo
    ORDER BY mes
  `).all(req.userId, anioActual.toString());

  res.json(datos);
});

// GET /api/transacciones/:id
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT * FROM transacciones WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!t) return res.status(404).json({ error: 'Transacción no encontrada' });
  res.json(t);
});

// POST /api/transacciones
router.post('/', authMiddleware, (req, res) => {
  const { tipo, monto, descripcion, categoria_id, fecha, hora, notas } = req.body;

  if (!tipo || !monto || !fecha) {
    return res.status(400).json({ error: 'Tipo, monto y fecha son requeridos' });
  }
  if (!['ingreso', 'egreso'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo debe ser ingreso o egreso' });
  }
  if (monto <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO transacciones (user_id, tipo, monto, descripcion, categoria_id, fecha, hora, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, tipo, monto, descripcion, categoria_id, fecha, hora || '00:00', notas);

  const nueva = db.prepare('SELECT * FROM transacciones WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nueva);
});

// PUT /api/transacciones/:id
router.put('/:id', authMiddleware, (req, res) => {
  const { tipo, monto, descripcion, categoria_id, fecha, hora, notas } = req.body;
  const db = getDb();

  const existente = db.prepare('SELECT id FROM transacciones WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existente) return res.status(404).json({ error: 'Transacción no encontrada' });

  db.prepare(`
    UPDATE transacciones SET
      tipo = COALESCE(?, tipo),
      monto = COALESCE(?, monto),
      descripcion = COALESCE(?, descripcion),
      categoria_id = COALESCE(?, categoria_id),
      fecha = COALESCE(?, fecha),
      hora = COALESCE(?, hora),
      notas = COALESCE(?, notas)
    WHERE id = ? AND user_id = ?
  `).run(tipo, monto, descripcion, categoria_id, fecha, hora, notas, req.params.id, req.userId);

  const actualizada = db.prepare('SELECT * FROM transacciones WHERE id = ?').get(req.params.id);
  res.json(actualizada);
});

// DELETE /api/transacciones/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM transacciones WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
  res.json({ mensaje: 'Transacción eliminada' });
});

module.exports = router;
