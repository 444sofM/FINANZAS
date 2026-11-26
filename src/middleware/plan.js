const { getDb } = require('../database');

const LIMITES = {
  free: { metas: 2, presupuestos: 3, categoriasPersonalizadas: false, exportar: false },
  plus: { metas: Infinity, presupuestos: Infinity, categoriasPersonalizadas: true, exportar: true },
  pro:  { metas: Infinity, presupuestos: Infinity, categoriasPersonalizadas: true, exportar: true },
};

// Un plan de pago vencido cuenta como Gratis
function planEfectivo(user) {
  if (!user || !LIMITES[user.plan] || user.plan === 'free') return 'free';
  if (user.plan_expira && new Date(user.plan_expira).getTime() < Date.now()) return 'free';
  return user.plan;
}

function limitesDe(userId) {
  const user = getDb().prepare('SELECT plan, plan_expira FROM users WHERE id = ?').get(userId);
  return LIMITES[planEfectivo(user)];
}

function planRequerido(res, mensaje) {
  return res.status(403).json({ error: mensaje, code: 'PLAN_REQUIRED' });
}

// Exige que el plan tenga habilitada una capacidad booleana (exportar, categoriasPersonalizadas)
function requierePlan(capacidad, mensaje) {
  return (req, res, next) => {
    if (limitesDe(req.userId)[capacidad]) return next();
    return planRequerido(res, mensaje);
  };
}

module.exports = { LIMITES, planEfectivo, limitesDe, planRequerido, requierePlan };
