import crypto from "node:crypto";
import path from "node:path";
import bcrypt from "bcrypt";
import express, { NextFunction, Request, Response } from "express";
import { Database } from "sqlite";
import { initDb } from "./db";

type Prioridade = "alta" | "media" | "baixa";
type StatusChamado = "aberto" | "resolvido";
type Perfil = "admin" | "tecnico" | "usuario";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
}

interface UsuarioPublico {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
}

interface Chamado {
  id: number;
  titulo: string;
  descricao: string;
  prioridade: Prioridade;
  status: StatusChamado;
  criadoEm: string;
  resolvidoEm: string | null;
  criadoPor: Pick<UsuarioPublico, "id" | "nome" | "email">;
}

declare global {
  namespace Express {
    interface Request {
      // Dados preenchidos pelo middleware quando o token é válido.
      usuario?: Usuario;
      token?: string;
    }
  }
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(process.cwd(), "public");
const prioridades: Prioridade[] = ["alta", "media", "baixa"];

function normalizarTexto(valor: unknown): string {
  return String(valor || "").trim();
}

function toUsuarioPublico(usuario: Usuario): UsuarioPublico {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
  };
}

function mapChamadoRow(row: Record<string, unknown>): Chamado {
  return {
    id: Number(row.id),
    titulo: String(row.titulo),
    descricao: String(row.descricao),
    prioridade: String(row.prioridade) as Prioridade,
    status: String(row.status) as StatusChamado,
    criadoEm: String(row.criado_em),
    resolvidoEm: row.resolvido_em ? String(row.resolvido_em) : null,
    criadoPor: {
      id: Number(row.criado_por_id),
      nome: String(row.criado_por_nome),
      email: String(row.criado_por_email),
    },
  };
}

function extrairToken(req: Request): string | null {
  const header = normalizarTexto(req.header("authorization"));
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function criarMiddlewareAutenticacao(db: Database) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Verifica token de sessão salvo no SQLite.
    const token = extrairToken(req);
    if (!token) {
      res.status(401).json({ erro: "Token de acesso ausente." });
      return;
    }

    const row = await db.get<Record<string, unknown>>(
      `
      SELECT u.id, u.nome, u.email, u.senha, u.perfil
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
      `,
      [token],
    );

    if (!row) {
      res.status(401).json({ erro: "Sessao invalida ou expirada." });
      return;
    }

    req.usuario = {
      id: Number(row.id),
      nome: String(row.nome),
      email: String(row.email),
      senha: String(row.senha),
      perfil: String(row.perfil) as Perfil,
    };
    req.token = token;
    next();
  };
}

function permitirPerfis(perfis: Perfil[]) {
  // RBAC simples: bloqueia perfis fora da lista permitida.
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      res.status(403).json({ erro: "Sem permissao para esta acao." });
      return;
    }
    next();
  };
}

async function bootstrap(): Promise<void> {
  const db = await initDb();
  const autenticar = criarMiddlewareAutenticacao(db);

  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const email = normalizarTexto(req.body.email).toLowerCase();
    const senha = normalizarTexto(req.body.senha);

    const row = await db.get<Record<string, unknown>>(
      `SELECT id, nome, email, senha, perfil FROM users WHERE lower(email) = ?`,
      [email],
    );

    const senhaValida = row ? await bcrypt.compare(senha, String(row.senha)) : false;

    if (!row || !senhaValida) {
      res.status(401).json({ erro: "Credenciais invalidas." });
      return;
    }

    const usuario: Usuario = {
      id: Number(row.id),
      nome: String(row.nome),
      email: String(row.email),
      senha: String(row.senha),
      perfil: String(row.perfil) as Perfil,
    };

    const token = crypto.randomUUID();
    await db.run(`INSERT INTO sessions (token, user_id) VALUES (?, ?)`, [token, usuario.id]);

    res.json({ token, usuario: toUsuarioPublico(usuario) });
  });

  app.get("/api/auth/me", autenticar, (req: Request, res: Response) => {
    res.json({ usuario: toUsuarioPublico(req.usuario as Usuario) });
  });

  app.post("/api/auth/logout", autenticar, async (req: Request, res: Response) => {
    if (req.token) {
      await db.run(`DELETE FROM sessions WHERE token = ?`, [req.token]);
    }
    res.status(204).send();
  });

  app.get("/api/tickets", autenticar, async (req: Request, res: Response) => {
    const statusFiltro = normalizarTexto(req.query.status).toLowerCase();
    const prioridadeFiltro = normalizarTexto(req.query.prioridade).toLowerCase();
    const usuario = req.usuario as Usuario;

    const conditions: string[] = [];
    const params: Array<string | number> = [];

    // Usuário comum visualiza apenas os próprios chamados.
    if (usuario.perfil === "usuario") {
      conditions.push("t.criado_por = ?");
      params.push(usuario.id);
    }

    if (statusFiltro) {
      conditions.push("t.status = ?");
      params.push(statusFiltro);
    }

    if (prioridadeFiltro) {
      conditions.push("t.prioridade = ?");
      params.push(prioridadeFiltro);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.all<Record<string, unknown>[]>(
      `
      SELECT
        t.id,
        t.titulo,
        t.descricao,
        t.prioridade,
        t.status,
        t.criado_em,
        t.resolvido_em,
        u.id AS criado_por_id,
        u.nome AS criado_por_nome,
        u.email AS criado_por_email
      FROM tickets t
      JOIN users u ON u.id = t.criado_por
      ${whereClause}
      ORDER BY CASE WHEN t.status = 'aberto' THEN 0 ELSE 1 END, datetime(t.criado_em) DESC
      `,
      params,
    );

    res.json(rows.map((row) => mapChamadoRow(row)));
  });

  app.post("/api/tickets", autenticar, async (req: Request, res: Response) => {
    const titulo = normalizarTexto(req.body.titulo);
    const descricao = normalizarTexto(req.body.descricao);
    const prioridade = normalizarTexto(req.body.prioridade).toLowerCase() as Prioridade;

    if (!titulo) {
      res.status(400).json({ erro: "O titulo e obrigatorio." });
      return;
    }

    if (!descricao) {
      res.status(400).json({ erro: "A descricao e obrigatoria." });
      return;
    }

    if (!prioridades.includes(prioridade)) {
      res.status(400).json({ erro: "Prioridade invalida. Use alta, media ou baixa." });
      return;
    }

    const usuario = req.usuario as Usuario;
    const criadoEm = new Date().toISOString();

    const result = await db.run(
      `
      INSERT INTO tickets (titulo, descricao, prioridade, status, criado_em, criado_por)
      VALUES (?, ?, ?, 'aberto', ?, ?)
      `,
      [titulo, descricao, prioridade, criadoEm, usuario.id],
    );

    const row = await db.get<Record<string, unknown>>(
      `
      SELECT
        t.id,
        t.titulo,
        t.descricao,
        t.prioridade,
        t.status,
        t.criado_em,
        t.resolvido_em,
        u.id AS criado_por_id,
        u.nome AS criado_por_nome,
        u.email AS criado_por_email
      FROM tickets t
      JOIN users u ON u.id = t.criado_por
      WHERE t.id = ?
      `,
      [result.lastID],
    );

    res.status(201).json(mapChamadoRow(row as Record<string, unknown>));
  });

  app.patch("/api/tickets/:id/resolve", autenticar, permitirPerfis(["admin", "tecnico"]), async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = await db.get<Record<string, unknown>>(`SELECT status FROM tickets WHERE id = ?`, [id]);

    if (!row) {
      res.status(404).json({ erro: "Chamado nao encontrado." });
      return;
    }

    if (String(row.status) === "resolvido") {
      res.status(409).json({ erro: "Chamado ja esta resolvido." });
      return;
    }

    await db.run(`UPDATE tickets SET status = 'resolvido', resolvido_em = ? WHERE id = ?`, [new Date().toISOString(), id]);

    const atualizado = await db.get<Record<string, unknown>>(
      `
      SELECT
        t.id,
        t.titulo,
        t.descricao,
        t.prioridade,
        t.status,
        t.criado_em,
        t.resolvido_em,
        u.id AS criado_por_id,
        u.nome AS criado_por_nome,
        u.email AS criado_por_email
      FROM tickets t
      JOIN users u ON u.id = t.criado_por
      WHERE t.id = ?
      `,
      [id],
    );

    res.json(mapChamadoRow(atualizado as Record<string, unknown>));
  });

  app.get("/{*rota}", (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Sistema de chamados ativo em http://localhost:${PORT}`);
    console.log("Banco SQLite em data/helpdesk.sqlite");
    console.log("Login admin: admin@helpdesk.local / 123456");
    console.log("Login tecnico: tecnico@helpdesk.local / 123456");
    console.log("Login usuario: usuario@helpdesk.local / 123456");
  });
}

void bootstrap().catch((error: unknown) => {
  console.error("Falha ao iniciar o servidor:", error);
  process.exit(1);
});
