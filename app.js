/* ==========================================================================
   GRUPO JORLAN — Ferramenta de Orçamentos para Vendedores Externos
   Camada de dados: hoje usa localStorage (funciona 100% offline / standalone).
   Estrutura pensada para depois ser plugada em Google Sheets via Apps Script
   (ver notas no final do arquivo e o arquivo Code.gs de referência).
   ========================================================================== */

const DB_KEY = 'jorlan_db_v1';
const MARCAS = ['Renault', 'GM'];

function baseDeProdutos(marca){
  return marca === 'Renault' ? PRODUTOS_RENAULT : PRODUTOS_GM;
}

function dbPadrao(){
  return {
    usuarios: [
      { id: 'u1', nome: 'Joabe Santos', login: 'gestor.renault', senha: '1234', telefone: '(62) 99359-2404', perfil: 'gestor', marca: 'Renault', status: 'ativo' },
      { id: 'u2', nome: 'Vendedor Demo', login: 'vendedor.renault', senha: '1234', telefone: '(62) 90000-0001', perfil: 'vendedor', marca: 'Renault', status: 'ativo' },
      { id: 'u3', nome: 'Faturamento Renault', login: 'faturamento.renault', senha: '1234', telefone: '', perfil: 'faturamento', marca: 'Renault', status: 'ativo' },
      { id: 'u4', nome: 'Joabe Santos', login: 'gestor.gm', senha: '1234', telefone: '(62) 99359-2404', perfil: 'gestor', marca: 'GM', status: 'ativo' },
      { id: 'u5', nome: 'Vendedor Demo GM', login: 'vendedor.gm', senha: '1234', telefone: '(62) 90000-0002', perfil: 'vendedor', marca: 'GM', status: 'ativo' },
      { id: 'u6', nome: 'Faturamento GM', login: 'faturamento.gm', senha: '1234', telefone: '', perfil: 'faturamento', marca: 'GM', status: 'ativo' },
    ],
    clientes: [],
    orcamentos: [],
    rotas: [],
    parametros: {
      Renault: { margemMinima: 10 },
      GM: { margemMinima: 10 }
    },
    seq: 100
  };
}

function getDB(){
  let raw = localStorage.getItem(DB_KEY);
  if(!raw){
    const padrao = dbPadrao();
    localStorage.setItem(DB_KEY, JSON.stringify(padrao));
    return padrao;
  }
  try{ return JSON.parse(raw); } catch(e){ return dbPadrao(); }
}
function setDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function novoId(){
  const db = getDB();
  db.seq = (db.seq || 100) + 1;
  setDB(db);
  return 'id' + db.seq;
}

/* ---------------- Estado de sessão ---------------- */
let SESSAO = { marca: null, usuario: null };
let ORCAMENTO_EM_EDICAO = null; // objeto do orçamento sendo montado/editado
let TELA_ATUAL = 'produtos';

/* ---------------- Utilitários ---------------- */
function fmtMoeda(v){
  return (Number(v)||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function fmtData(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}
function iniciais(nome){
  return (nome||'?').split(' ').filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('');
}
function toast(msg, tipo){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (tipo ? ' ' + tipo : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}
function fecharModal(){ document.getElementById('modal-root').innerHTML = ''; }
function abrirModal(html){ document.getElementById('modal-root').innerHTML =
  `<div class="modal-overlay" onclick="if(event.target===this)fecharModal()"><div class="modal">${html}</div></div>`; }

function corMarcaLogo(marca){
  // Preenche os "boxes" de logo em várias partes da tela com <img> + fallback texto
  const src = marca === 'Renault' ? 'assets/logo-renault.png' : 'assets/logo-gm.png';
  const cor = marca === 'Renault' ? '#FDB913' : '#C9A227';
  const texto = marca === 'Renault' ? 'RENAULT' : 'CHEVROLET';
  return `<img class="logo" src="${src}" alt="${marca}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
          <div class="logo-fallback" style="display:none;color:${cor};font-size:15px;">${texto}</div>`;
}

/* ---------------- Seleção de marca / login ---------------- */
function selecionarMarca(marca){
  SESSAO.marca = marca;
  document.getElementById('tela-marca').classList.add('hidden');
  document.getElementById('tela-login').classList.remove('hidden');
  document.getElementById('login-logo-box').innerHTML = corMarcaLogo(marca);
  document.getElementById('login-marca-nome').textContent = 'Peças ' + (marca === 'Renault' ? 'Renault' : 'GM');
  document.getElementById('login-usuario').value = '';
  document.getElementById('login-senha').value = '';
  document.getElementById('login-erro').textContent = '';
  document.getElementById('login-usuario').focus();
}
function voltarParaMarca(){
  SESSAO.marca = null;
  document.getElementById('tela-login').classList.add('hidden');
  document.getElementById('tela-marca').classList.remove('hidden');
}
function fazerLogin(ev){
  ev.preventDefault();
  const login = document.getElementById('login-usuario').value.trim();
  const senha = document.getElementById('login-senha').value;
  const db = getDB();
  const usuario = db.usuarios.find(u => u.login.toLowerCase() === login.toLowerCase() && u.marca === SESSAO.marca);
  if(!usuario || usuario.senha !== senha){
    document.getElementById('login-erro').textContent = 'Usuário ou senha inválidos para esta marca.';
    return false;
  }
  if(usuario.status !== 'ativo'){
    document.getElementById('login-erro').textContent = 'Este acesso está desativado. Fale com a gestão.';
    return false;
  }
  SESSAO.usuario = usuario;
  document.getElementById('tela-login').classList.add('hidden');
  entrarNoApp();
  return false;
}
function sair(){
  SESSAO = { marca: null, usuario: null };
  document.getElementById('app').classList.remove('ativo');
  document.getElementById('tela-marca').classList.remove('hidden');
}

/* ---------------- Shell do app / navegação ---------------- */
const MENUS = {
  vendedor: [
    { id:'produtos', label:'Consultar Produtos', icone:'🔍' },
    { id:'novo-orcamento', label:'Novo Orçamento', icone:'🧾' },
    { id:'meus-orcamentos', label:'Meus Orçamentos', icone:'📋' },
    { id:'rotas', label:'Rotas de Visita', icone:'🗺️' },
  ],
  gestor: [
    { id:'produtos', label:'Consultar Produtos', icone:'🔍' },
    { id:'novo-orcamento', label:'Novo Orçamento', icone:'🧾' },
    { id:'meus-orcamentos', label:'Meus Orçamentos', icone:'📋' },
    { id:'rotas', label:'Rotas de Visita', icone:'🗺️' },
    { id:'__sep_gestao', label:'Gestão', secao:true },
    { id:'todos-orcamentos', label:'Todos os Orçamentos', icone:'📊' },
    { id:'aprovacoes-margem', label:'Aprovações de Margem', icone:'✅' },
    { id:'vendedores', label:'Cadastro de Vendedores', icone:'👥' },
    { id:'parametros', label:'Margem Mínima', icone:'⚙️' },
  ],
  faturamento: [
    { id:'aprovados', label:'Orçamentos Aprovados', icone:'💳' },
  ]
};

function entrarNoApp(){
  document.getElementById('app').classList.add('ativo');
  const u = SESSAO.usuario;
  document.getElementById('sidebar-logo-box').innerHTML = corMarcaLogo(SESSAO.marca);
  document.getElementById('sidebar-marca-nome').textContent = 'Peças ' + SESSAO.marca;
  document.getElementById('avatar-iniciais').textContent = iniciais(u.nome);
  document.getElementById('user-nome').textContent = u.nome;
  document.getElementById('user-cargo').textContent = { gestor:'Gestor', vendedor:'Vendedor', faturamento:'Faturamento' }[u.perfil];

  const menu = MENUS[u.perfil] || [];
  const nav = document.getElementById('nav-list');
  nav.innerHTML = menu.map(item => item.secao
    ? `<div class="nav-section-title">${item.label}</div>`
    : `<button class="nav-item" data-tela="${item.id}" onclick="irPara('${item.id}')">${item.icone} ${item.label}</button>`
  ).join('');

  const inicial = u.perfil === 'faturamento' ? 'aprovados' : 'produtos';
  irPara(inicial);
}

const TITULOS = {
  'produtos':'Consulta de Produtos',
  'novo-orcamento':'Novo Orçamento',
  'meus-orcamentos':'Meus Orçamentos',
  'rotas':'Rotas de Visita',
  'todos-orcamentos':'Todos os Orçamentos',
  'aprovacoes-margem':'Aprovações de Margem',
  'vendedores':'Cadastro de Vendedores',
  'parametros':'Margem Mínima por Marca',
  'aprovados':'Orçamentos Aprovados — Faturamento'
};
const RENDERERS = {}; // preenchido em outros arquivos (telas.js)

function irPara(tela){
  TELA_ATUAL = tela;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
  document.getElementById('topbar-titulo').textContent = TITULOS[tela] || '';
  document.getElementById('topbar-acoes').innerHTML = '';
  const fn = RENDERERS[tela];
  document.getElementById('content').innerHTML = fn ? '' : '<div class="empty-state">Tela em construção.</div>';
  if(fn) fn();
}
function recarregarTela(){ irPara(TELA_ATUAL); }

/* ---------------- Regras de negócio compartilhadas ---------------- */
function margemMinima(marca){
  const db = getDB();
  return (db.parametros[marca] && db.parametros[marca].margemMinima) || 0;
}
// Margem de Lucro = Preço de Venda - ICMS(sobre a venda) - Custo Contábil
// margemPct é sobre o preço de venda (margem líquida percentual)
function calcularItem({ custoContabil, icmsPct, precoVenda }){
  custoContabil = Number(custoContabil)||0;
  icmsPct = Number(icmsPct)||0;
  precoVenda = Number(precoVenda)||0;
  const valorIcms = precoVenda * (icmsPct/100);
  const margemValor = precoVenda - valorIcms - custoContabil;
  const margemPct = precoVenda > 0 ? (margemValor / precoVenda) * 100 : 0;
  return { valorIcms, margemValor, margemPct };
}
function precoPorMargemDesejada({ custoContabil, icmsPct, margemPctDesejada }){
  // PV - PV*icms% - custo = PV*margem% => PV*(1 - icms% - margem%) = custo
  custoContabil = Number(custoContabil)||0;
  icmsPct = Number(icmsPct)||0;
  margemPctDesejada = Number(margemPctDesejada)||0;
  const fator = 1 - (icmsPct/100) - (margemPctDesejada/100);
  if(fator <= 0) return custoContabil * 2; // evita divisão inválida quando irreal
  return custoContabil / fator;
}

function statusInfo(status){
  const mapa = {
    'rascunho': { label:'Rascunho', cls:'badge-cinza' },
    'aguardando_margem': { label:'Aguardando aprovação de margem', cls:'badge-amber' },
    'pendente': { label:'Pendente (com cliente)', cls:'badge-amber' },
    'aprovado': { label:'Aprovado — aguard. faturamento', cls:'badge-gold' },
    'faturado': { label:'Faturado', cls:'badge-verde' },
    'recusado_margem': { label:'Margem recusada', cls:'badge-vermelho' },
    'cancelado': { label:'Cancelado', cls:'badge-vermelho' },
  };
  return mapa[status] || { label:status, cls:'badge-cinza' };
}

function orcamentoVencido(orc){
  if(orc.status !== 'pendente') return false;
  const dias = (Date.now() - new Date(orc.dataCriacao).getTime()) / 86400000;
  return dias > 7;
}
