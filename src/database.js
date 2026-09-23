const Database = require('better-sqlite3');
const path = require('path');

// En Railway los volúmenes se montan en /data por convención.
// Si existe esa carpeta, usamos ese path para que la BD persista entre deploys.
// En desarrollo usa la carpeta del proyecto.
const DB_DIR  = process.env.DB_PATH || path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'finanzas.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeTables();
  }
  return db;
}

function initializeTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT 'default',
      moneda TEXT DEFAULT 'USD',
      notification_time TEXT DEFAULT '20:00',
      notifications_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categorias_ingreso (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      icono TEXT DEFAULT '💰',
      color TEXT DEFAULT '#10b981',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categorias_egreso (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      icono TEXT DEFAULT '💸',
      color TEXT DEFAULT '#ef4444',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('ingreso', 'egreso')),
      monto REAL NOT NULL,
      descripcion TEXT,
      categoria_id INTEGER,
      fecha DATE NOT NULL,
      hora TIME DEFAULT '00:00',
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS metas_ahorro (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      monto_objetivo REAL NOT NULL,
      monto_actual REAL DEFAULT 0,
      fecha_limite DATE,
      descripcion TEXT,
      completada INTEGER DEFAULT 0,
      color TEXT DEFAULT '#6366f1',
      icono TEXT DEFAULT '🎯',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS presupuestos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      categoria_id INTEGER NOT NULL,
      monto_limite REAL NOT NULL,
      mes INTEGER NOT NULL,
      anio INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES categorias_egreso(id) ON DELETE CASCADE
    );
  `);
}

module.exports = { getDb };
