// public/app.ts
var TOKEN_KEY = "helpdesk_token";
var loginForm = document.getElementById("loginForm");
var emailInput = document.getElementById("email");
var senhaInput = document.getElementById("senha");
var loginButton = document.getElementById("loginButton");
var logoutButton = document.getElementById("logoutButton");
var authMessage = document.getElementById("authMessage");
var userInfo = document.getElementById("userInfo");
var userName = document.getElementById("userName");
var userProfile = document.getElementById("userProfile");
var form = document.getElementById("ticketForm");
var formMessage = document.getElementById("formMessage");
var ticketList = document.getElementById("ticketList");
var emptyState = document.getElementById("emptyState");
var statusFilter = document.getElementById("statusFilter");
var prioridadeRotulo = {
  alta: "Alta",
  media: "Media",
  baixa: "Baixa"
};
var token = localStorage.getItem(TOKEN_KEY) || "";
var usuarioAtual = null;
function formatarData(iso) {
  const data = new Date(iso);
  return data.toLocaleString("pt-BR");
}
function mostrarMensagem(el, texto, erro = false) {
  el.textContent = texto;
  el.classList.toggle("error", erro);
}
function atualizarUIAutenticacao() {
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
async function apiFetch(input, init = {}) {
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
function podeResolverChamado() {
  return usuarioAtual?.perfil === "admin" || usuarioAtual?.perfil === "tecnico";
}
function renderizarChamados(chamados) {
  ticketList.innerHTML = "";
  if (!chamados.length) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  chamados.forEach((chamado) => {
    const item = document.createElement("li");
    item.className = "ticket";
    const botaoResolver = chamado.status === "aberto" && podeResolverChamado() ? `<button data-resolver="${chamado.id}">Marcar Resolvido</button>` : chamado.status === "resolvido" ? `<span class="resolved">Resolvido em ${formatarData(chamado.resolvidoEm || "")}</span>` : "";
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
async function carregarChamados() {
  if (!usuarioAtual) return;
  const filtroStatus = statusFilter.value;
  const url = filtroStatus ? `/api/tickets?status=${filtroStatus}` : "/api/tickets";
  const resposta = await apiFetch(url);
  const dados = await resposta.json();
  renderizarChamados(dados);
}
async function preencherSessao() {
  if (!token) {
    atualizarUIAutenticacao();
    return;
  }
  const resposta = await apiFetch("/api/auth/me");
  if (!resposta.ok) {
    atualizarUIAutenticacao();
    return;
  }
  const dados = await resposta.json();
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
    body: JSON.stringify({ email: emailInput.value, senha: senhaInput.value })
  });
  const dados = await resposta.json();
  if (!resposta.ok || !dados.token || !dados.usuario) {
    mostrarMensagem(authMessage, dados.erro || "Nao foi possivel fazer login.", true);
    loginButton.disabled = false;
    return;
  }
  token = dados.token;
  usuarioAtual = dados.usuario;
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
    titulo: form.elements.namedItem("titulo").value,
    descricao: form.elements.namedItem("descricao").value,
    prioridade: form.elements.namedItem("prioridade").value
  };
  const resposta = await apiFetch("/api/tickets", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    mostrarMensagem(formMessage, dados.erro || "Nao foi possivel criar o chamado.", true);
    return;
  }
  form.reset();
  form.elements.namedItem("prioridade").value = "media";
  mostrarMensagem(formMessage, "Chamado criado com sucesso.");
  await carregarChamados();
});
statusFilter.addEventListener("change", () => {
  void carregarChamados();
});
ticketList.addEventListener("click", async (evento) => {
  const target = evento.target;
  const botao = target.closest("button[data-resolver]");
  if (!botao) return;
  botao.disabled = true;
  const id = botao.dataset.resolver;
  const resposta = await apiFetch(`/api/tickets/${id}/resolve`, {
    method: "PATCH"
  });
  if (!resposta.ok) {
    const erro = await resposta.json();
    mostrarMensagem(formMessage, erro.erro || "Nao foi possivel atualizar o chamado.", true);
    botao.disabled = false;
    return;
  }
  await carregarChamados();
});
void preencherSessao();
