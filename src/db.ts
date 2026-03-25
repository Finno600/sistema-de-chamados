import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";

const DB_PATH = path.join(process.cwd(), "data", "helpdesk.sqlite");
const SALT_ROUNDS = 10;

const demoUsers = [
  { nome: "Administrador", email: "admin@helpdesk.local", senha: "123456", perfil: "admin" },
  { nome: "Tecnico Suporte", email: "tecnico@helpdesk.local", senha: "123456", perfil: "tecnico" },
  { nome: "Usuario Padrao", email: "usuario@helpdesk.local", senha: "123456", perfil: "usuario" },
] as const;

async function garantirUsuariosDemo(db: Database): Promise<void> {
  for (const user of demoUsers) {
    const existente = await db.get<{ id: number; senha: string }>(
      `SELECT id, senha FROM users WHERE email = ?`,
      [user.email],
    );

    const senhaHash = await bcrypt.hash(user.senha, SALT_ROUNDS);

    if (!existente) {
      await db.run(
        `INSERT INTO users (nome, email, senha, perfil) VALUES (?, ?, ?, ?)`,
        [user.nome, user.email, senhaHash, user.perfil],
      );
      continue;
    }

    // Migração automática: converte senha legada em texto puro para hash bcrypt.
    if (!existente.senha.startsWith("$2")) {
      await db.run(`UPDATE users SET senha = ?, perfil = ?, nome = ? WHERE id = ?`, [senhaHash, user.perfil, user.nome, existente.id]);
    }
  }
}

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
  await garantirUsuariosDemo(db);

  return db;
}
