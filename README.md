# Sistema de Chamados (Help Desk)

Projeto de Help Desk com TypeScript no backend e frontend.

## Funcionalidades

- Login
- Perfis de acesso (admin, tecnico, usuario)
- Criar chamado
- Listar chamados
- Marcar chamado como resolvido
- Prioridade: alta, media e baixa

## Tecnologias

- Backend: Node.js + Express + TypeScript
- Frontend: HTML, CSS + TypeScript (compilado para JS com esbuild)
- Banco de dados: SQLite

## Como executar

1. Instale dependencias:

```bash
npm install
```

2. Rode em modo desenvolvimento:

```bash
npm run dev
```

ou modo normal:

```bash
npm start
```

3. Abra no navegador:

- http://localhost:3000

## Login de demonstracao

- admin@helpdesk.local / 123456
- tecnico@helpdesk.local / 123456
- usuario@helpdesk.local / 123456

Regras de perfil:

- usuario: cria chamado e visualiza apenas os proprios
- tecnico: visualiza todos e pode resolver
- admin: visualiza todos e pode resolver

## API

### Login

`POST /api/auth/login`

Body JSON:

```json
{
  "email": "admin@helpdesk.local",
  "senha": "123456"
}
```

Resposta: token + usuario.

Use o header `Authorization: Bearer <token>` nas rotas protegidas.

### Usuario logado

`GET /api/auth/me`

### Logout

`POST /api/auth/logout`

### Criar chamado

`POST /api/tickets`

Body JSON:

```json
{
  "titulo": "Meu PC nao liga",
  "descricao": "Aperto o botao e nao inicia.",
  "prioridade": "alta"
}
```

### Listar chamados

`GET /api/tickets`

Filtros opcionais:

- `GET /api/tickets?status=aberto`
- `GET /api/tickets?status=resolvido`
- `GET /api/tickets?prioridade=alta`

### Resolver chamado

`PATCH /api/tickets/:id/resolve`

Exemplo:

`PATCH /api/tickets/1/resolve`

## Observacoes

- Os dados ficam persistidos em `data/helpdesk.sqlite`.
- Senhas e sessoes sao apenas para demonstracao local (sem hash nesta versao).

## Como explicar no GitHub e em entrevista

1. O backend inicia criando as tabelas automaticamente no SQLite (`users`, `sessions`, `tickets`).
2. Existe um seed de usuarios demo para facilitar testes locais.
3. O login gera token e salva em `sessions`; cada request protegida valida o token.
4. A regra de perfis (RBAC) controla quem pode apenas visualizar e quem pode resolver chamados.
5. Os chamados sao persistidos no banco, entao o sistema nao perde dados ao reiniciar.
