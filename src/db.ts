import fs from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";

const DB_PATH = path.join(process.cwd(), "data", "helpdesk.sqlite");

export async function initDb(): Promise<Database> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA foreign_keys = ON;");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'tecnico', 'usuario')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      prioridade TEXT NOT NULL CHECK (prioridade IN ('alta', 'media', 'baixa')),
      status TEXT NOT NULL CHECK (status IN ('aberto', 'resolvido')) DEFAULT 'aberto',
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      resolvido_em TEXT,
      criado_por INTEGER NOT NULL,
      FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_criado_por ON tickets(criado_por);
  `);

  // Seed básico para facilitar testes locais e apresentação do projeto.
  await db.run(
    `INSERT OR IGNORE INTO users (nome, email, senha, perfil) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
    [
      "Administrador",
      "admin@helpdesk.local",
      "123456",
      "admin",
      "Tecnico Suporte",
      "tecnico@helpdesk.local",
      "123456",
      "tecnico",
      "Usuario Padrao",
      "usuario@helpdesk.local",
      "123456",
      "usuario",
    ],
  );

  return db;
}
