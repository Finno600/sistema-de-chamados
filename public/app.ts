export {};

type Prioridade = "alta" | "media" | "baixa";
type Perfil = "admin" | "tecnico" | "usuario";
type StatusChamado = "aberto" | "resolvido";

interface Usuario {
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
  criadoPor: {
    id: number;
    nome: string;
    email: string;
  };
}

const TOKEN_KEY = "helpdesk_token";

const loginForm = document.getElementById("loginForm") as HTMLFormElement;
const emailInput = document.getElementById("email") as HTMLInputElement;
const senhaInput = document.getElementById("senha") as HTMLInputElement;
const loginButton = document.getElementById("loginButton") as HTMLButtonElement;
const logoutButton = document.getElementById("logoutButton") as HTMLButtonElement;
const authMessage = document.getElementById("authMessage") as HTMLParagraphElement;
const userInfo = document.getElementById("userInfo") as HTMLDivElement;
const userName = document.getElementById("userName") as HTMLSpanElement;
const userProfile = document.getElementById("userProfile") as HTMLSpanElement;

const form = document.getElementById("ticketForm") as HTMLFormElement;
const formMessage = document.getElementById("formMessage") as HTMLParagraphElement;
const ticketList = document.getElementById("ticketList") as HTMLUListElement;
const emptyState = document.getElementById("emptyState") as HTMLParagraphElement;
const statusFilter = document.getElementById("statusFilter") as HTMLSelectElement;

const prioridadeRotulo: Record<Prioridade, string> = {
  alta: "Alta",
  media: "Media",
  baixa: "Baixa",
};

let token = localStorage.getItem(TOKEN_KEY) || "";
let usuarioAtual: Usuario | null = null;

function formatarData(iso: string): string {
  const data = new Date(iso);
  return data.toLocaleString("pt-BR");
}

function mostrarMensagem(el: HTMLParagraphElement, texto: string, erro = false): void {
  el.textContent = texto;
  el.classList.toggle("error", erro);
}

function atualizarUIAutenticacao(): void {
  // Um único ponto para alternar telas de login/app conforme sessão.
  const autenticado = Boolean(usuarioAtual);

  loginForm.classList.toggle("hidden", autenticado);
  logoutButton.classList.toggle("hidden", !autenticado);
  userInfo.classList.toggle("hidden", !autenticado);
  form.classList.toggle("hidden", !autenticado);

  if (!usuarioAtual) {
    userName.textContent = "";
    userProfile.textContent = "";
    ticketList.innerHTML = "";
    emptyState.classList.remove("hidden");
    emptyState.textContent = "Faca login para visualizar seus chamados.";
    return;
  }

  userName.textContent = `${usuarioAtual.nome} (${usuarioAtual.email})`;
  userProfile.textContent = usuarioAtual.perfil;
  emptyState.textContent = "Nenhum chamado encontrado.";
}

async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // Wrapper de fetch para injetar token e tratar sessão expirada.
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const resposta = await fetch(input, { ...init, headers });

  if (resposta.status === 401) {
    token = "";
    usuarioAtual = null;
    localStorage.removeItem(TOKEN_KEY);
    atualizarUIAutenticacao();
  }

  return resposta;
}

function podeResolverChamado(): boolean {
  // Regra de UI alinhada à regra do backend.
  return usuarioAtual?.perfil === "admin" || usuarioAtual?.perfil === "tecnico";
}

function renderizarChamados(chamados: Chamado[]): void {
  ticketList.innerHTML = "";

  if (!chamados.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  chamados.forEach((chamado) => {
    const item = document.createElement("li");
    item.className = "ticket";

    const botaoResolver =
      chamado.status === "aberto" && podeResolverChamado()
        ? `<button data-resolver="${chamado.id}">Marcar Resolvido</button>`
        : chamado.status === "resolvido"
          ? `<span class="resolved">Resolvido em ${formatarData(chamado.resolvidoEm || "")}</span>`
          : "";

    item.innerHTML = `
      <div class="ticket-head">
        <span class="ticket-title">${chamado.titulo}</span>
        <span class="badge ${chamado.prioridade}">${prioridadeRotulo[chamado.prioridade]}</span>
      </div>
      <div>${chamado.descricao}</div>
      <small>
        Criado por ${chamado.criadoPor.nome} em ${formatarData(chamado.criadoEm)} | Status: ${chamado.status}
      </small>
      ${botaoResolver}
    `;

    ticketList.appendChild(item);
  });
}

async function carregarChamados(): Promise<void> {
  if (!usuarioAtual) return;

  const filtroStatus = statusFilter.value;
  const url = filtroStatus ? `/api/tickets?status=${filtroStatus}` : "/api/tickets";
  const resposta = await apiFetch(url);
  const dados = (await resposta.json()) as Chamado[];
  renderizarChamados(dados);
}

async function preencherSessao(): Promise<void> {
  // Na abertura da página, reaproveita token salvo no localStorage.
  if (!token) {
    atualizarUIAutenticacao();
    return;
  }

  const resposta = await apiFetch("/api/auth/me");
  if (!resposta.ok) {
    atualizarUIAutenticacao();
    return;
  }

  const dados = (await resposta.json()) as { usuario: Usuario };
  usuarioAtual = dados.usuario;
  atualizarUIAutenticacao();
  await carregarChamados();
}

loginForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMensagem(authMessage, "Autenticando...");
  loginButton.disabled = true;

  const resposta = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailInput.value, senha: senhaInput.value }),
  });

  const dados = (await resposta.json()) as { token?: string; usuario?: Usuario; erro?: string };

  if (!resposta.ok || !dados.token || !dados.usuario) {
    mostrarMensagem(authMessage, dados.erro || "Nao foi possivel fazer login.", true);
    loginButton.disabled = false;
    return;
  }

  token = dados.token;
  usuarioAtual = dados.usuario;
  // Persistência simples de sessão no navegador.
  localStorage.setItem(TOKEN_KEY, token);
  loginForm.reset();
  mostrarMensagem(authMessage, "Login realizado com sucesso.");
  atualizarUIAutenticacao();
  await carregarChamados();
  loginButton.disabled = false;
});

logoutButton.addEventListener("click", async () => {
  if (token) {
    await apiFetch("/api/auth/logout", { method: "POST" });
  }

  token = "";
  usuarioAtual = null;
  localStorage.removeItem(TOKEN_KEY);
  mostrarMensagem(authMessage, "Sessao encerrada.");
  atualizarUIAutenticacao();
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMensagem(formMessage, "Enviando...");

  const payload = {
    // Coleta tipada dos campos do formulário.
    titulo: (form.elements.namedItem("titulo") as HTMLInputElement).value,
    descricao: (form.elements.namedItem("descricao") as HTMLTextAreaElement).value,
    prioridade: (form.elements.namedItem("prioridade") as HTMLSelectElement).value,
  };

  const resposta = await apiFetch("/api/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const dados = (await resposta.json()) as { erro?: string };

  if (!resposta.ok) {
    mostrarMensagem(formMessage, dados.erro || "Nao foi possivel criar o chamado.", true);
    return;
  }

  form.reset();
  (form.elements.namedItem("prioridade") as HTMLSelectElement).value = "media";
  mostrarMensagem(formMessage, "Chamado criado com sucesso.");
  await carregarChamados();
});

statusFilter.addEventListener("change", () => {
  void carregarChamados();
});

ticketList.addEventListener("click", async (evento) => {
  const target = evento.target as HTMLElement;
  const botao = target.closest("button[data-resolver]") as HTMLButtonElement | null;
  if (!botao) return;

  botao.disabled = true;
  const id = botao.dataset.resolver;

  const resposta = await apiFetch(`/api/tickets/${id}/resolve`, {
    method: "PATCH",
  });

  if (!resposta.ok) {
    const erro = (await resposta.json()) as { erro?: string };
    mostrarMensagem(formMessage, erro.erro || "Nao foi possivel atualizar o chamado.", true);
    botao.disabled = false;
    return;
  }

  await carregarChamados();
});

void preencherSessao();
