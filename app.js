/* ==========================================================================
   GRUPO JORLAN — Ferramenta de Orçamentos para Vendedores Externos
   Camada de dados: hoje usa localStorage (funciona 100% offline / standalone).
   Estrutura pensada para depois ser plugada em Google Sheets via Apps Script
   (ver notas no final do arquivo e o arquivo Code.gs de referência).
   ========================================================================== */

const DB_KEY = 'jorlan_db_v1';
const MARCAS = ['Renault', 'GM'];

/* ---------------- Conexão com o backend (Google Apps Script + Sheets) ---------------- */
// Cole aqui a URL do Web App publicada (Implantar > Nova implantação > Aplicativo da Web).
const API_URL = 'https://script.google.com/macros/s/AKfycbxYZ91kjuLUHpLNYp8yI1VKUGMeGV2ppQ3gsKgICxvVE9C__u4OyYeNJHVumfSjNknu/exec';

async function apiGet(acao, params){
  params = params || {};
  const qs = new URLSearchParams(Object.assign({ acao }, params)).toString();
  const resp = await fetch(`${API_URL}?${qs}`);
  if(!resp.ok) throw new Error('Falha ao buscar ' + acao);
  return await resp.json();
}
async function apiPost(aba, registro){
  await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS no Apps Script
    body: JSON.stringify({ aba, registro })
  });
}
// Grava local (instantâneo) e também tenta gravar na planilha em segundo
// plano — se a internet falhar, o app continua funcionando local e
// tenta de novo na próxima sincronização.
function sincronizarRegistro(aba, registro){
  apiPost(aba, registro).catch(() => {
    toast('Sem conexão com a planilha — salvo só neste aparelho por enquanto', 'erro');
  });
}

function baseDeProdutos(marca){
  return marca === 'Renault' ? PRODUTOS_RENAULT : PRODUTOS_GM;
}
// Agrupa a base "flat" (uma linha por loja) em uma linha por código,
// listando todas as lojas/empresas que possuem aquele item e seus custos.
// Usa os dados vindos da planilha (buscados em carregarProdutosRemoto) quando
// disponíveis; cai para a base local embutida como plano B (offline).
function produtosAgrupados(marca){
  const cacheKey = '_agrupCache_' + marca;
  if(window[cacheKey]) return window[cacheKey];
  const fallbackKey = '_agrupFallback_' + marca;
  if(window[fallbackKey]) return window[fallbackKey];
  const base = baseDeProdutos(marca);
  const mapa = new Map();
  base.forEach(p => {
    if(!mapa.has(p.codigo)){
      mapa.set(p.codigo, { codigo: p.codigo, descricao: p.descricao, curva: p.curva, possuiPis:false, possuiCofins:false, lojas: [] });
    }
    const grupo = mapa.get(p.codigo);
    if(p.possuiPis) grupo.possuiPis = true;
    if(p.possuiCofins) grupo.possuiCofins = true;
    grupo.lojas.push({
      empresa: p.empresa,
      fornecedor: p.fornecedor,
      quantidade: p.quantidade,
      custoContabil: p.custoContabil,
      precoVendaIC: p.precoVendaIC,
      precoVendaFor: p.precoVendaFor,
      curva: p.curva,
      locacao: p.locacao,
      possuiPis: p.possuiPis,
      possuiCofins: p.possuiCofins,
    });
  });
  const lista = Array.from(mapa.values());
  window[fallbackKey] = lista;
  return lista;
}
async function carregarProdutosRemoto(marca){
  try{
    const dados = await apiGet('produtos', { marca });
    if(Array.isArray(dados) && dados.length){
      window['_agrupCache_' + marca] = dados;
    }
  }catch(err){
    // sem internet ou planilha fora do ar: mantém a base local embutida como já está
  } finally {
    if(SESSAO.marca === marca && (TELA_ATUAL === 'produtos' || TELA_ATUAL === 'novo-orcamento')){
      recarregarTela();
    }
  }
}
// Mescla uma lista local com a vinda do servidor por id: o servidor tem
// prioridade quando o mesmo id existe nos dois lados, mas um registro que só
// existe localmente (ex: acabou de ser criado e a sincronização ainda não
// confirmou) NUNCA é apagado por engano — evita perder cadastro novo.
function mesclarPorId(local, remoto){
  const mapa = new Map();
  (local||[]).forEach(item => { if(item && item.id) mapa.set(item.id, item); });
  (remoto||[]).forEach(item => { if(item && item.id) mapa.set(item.id, item); });
  return Array.from(mapa.values());
}
async function sincronizarComServidor(){
  try{
    const [usuariosRemoto, orcamentosRemoto, rotasRemoto, parametrosRemoto] = await Promise.all([
      apiGet('usuarios'), apiGet('orcamentos'), apiGet('rotas'), apiGet('parametros')
    ]);
    const db = getDB();
    if(Array.isArray(usuariosRemoto)){
      if(usuariosRemoto.length){
        db.usuarios = mesclarPorId(db.usuarios, usuariosRemoto);
      } else {
        // planilha ainda sem usuários: envia os de teste locais como carga inicial
        db.usuarios.forEach(u => sincronizarRegistro('Usuarios', u));
      }
    }
    if(Array.isArray(orcamentosRemoto)) db.orcamentos = mesclarPorId(db.orcamentos, orcamentosRemoto);
    if(Array.isArray(rotasRemoto)) db.rotas = mesclarPorId(db.rotas, rotasRemoto);
    if(Array.isArray(parametrosRemoto) && parametrosRemoto.length){
      parametrosRemoto.forEach(p => { db.parametros[p.marca] = { margemMinima: p.margemMinima }; });
    }
    setDB(db);
  }catch(err){
    toast('Não foi possível sincronizar com a planilha agora — usando dados salvos neste aparelho', 'erro');
  }
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
  // Gerado sem depender de nada salvo no navegador (timestamp + parte aleatória),
  // pra nunca colidir com um id já existente em outro aparelho ou após limpar o cache.
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  fecharTrocaSenha();
  carregarProdutosRemoto(marca); // já começa a buscar em segundo plano, antes mesmo do login
  sincronizarComServidor(); // já traz usuários/orçamentos/rotas atualizados, pra login funcionar com dado fresco
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

/* ---------------- Trocar senha ---------------- */
function abrirTrocaSenha(){
  document.getElementById('form-login').classList.add('hidden');
  document.getElementById('form-troca-senha').classList.remove('hidden');
  document.getElementById('troca-senha-msg').textContent = '';
  document.getElementById('ts-usuario').focus();
}
function fecharTrocaSenha(){
  document.getElementById('form-troca-senha').classList.add('hidden');
  document.getElementById('form-login').classList.remove('hidden');
}
function trocarSenha(ev){
  ev.preventDefault();
  const login = document.getElementById('ts-usuario').value.trim();
  const senhaAtual = document.getElementById('ts-senha-atual').value;
  const senhaNova = document.getElementById('ts-senha-nova').value;
  const msg = document.getElementById('troca-senha-msg');
  if(!senhaNova || senhaNova.length < 3){
    msg.textContent = 'A nova senha precisa ter pelo menos 3 caracteres.';
    return false;
  }
  const db = getDB();
  const usuario = db.usuarios.find(u => u.login.toLowerCase() === login.toLowerCase() && u.marca === SESSAO.marca);
  if(!usuario || usuario.senha !== senhaAtual){
    msg.textContent = 'Usuário ou senha atual incorretos para esta marca.';
    return false;
  }
  usuario.senha = senhaNova;
  setDB(db);
  sincronizarRegistro('Usuarios', usuario);
  fecharTrocaSenha();
  toast('Senha atualizada com sucesso', 'sucesso');
  return false;
}

/* ---------------- Shell do app / navegação ---------------- */
const MENUS = {
  vendedor: [
    { id:'produtos', label:'Consultar Produtos', icone:'busca' },
    { id:'novo-orcamento', label:'Novo Orçamento', icone:'orcamento' },
    { id:'meus-orcamentos', label:'Meus Orçamentos', icone:'lista' },
    { id:'rotas', label:'Rotas de Visita', icone:'mapa' },
  ],
  gestor: [
    { id:'produtos', label:'Consultar Produtos', icone:'busca' },
    { id:'novo-orcamento', label:'Novo Orçamento', icone:'orcamento' },
    { id:'meus-orcamentos', label:'Meus Orçamentos', icone:'lista' },
    { id:'rotas', label:'Rotas de Visita', icone:'mapa' },
    { id:'__sep_gestao', label:'Gestão', secao:true },
    { id:'todos-orcamentos', label:'Todos os Orçamentos', icone:'grafico' },
    { id:'aprovacoes-margem', label:'Aprovações de Margem', icone:'check' },
    { id:'aprovados', label:'Faturamento', icone:'cartao' },
    { id:'vendedores', label:'Cadastro de Vendedores', icone:'usuarios' },
    { id:'parametros', label:'Margem Mínima', icone:'engrenagem' },
  ],
  faturamento: [
    { id:'aprovados', label:'Orçamentos Aprovados', icone:'cartao' },
  ]
};

const ICONS = {
  busca: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M17 17l-4-4" stroke-linecap="round"/></svg>',
  orcamento: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 7h6M7 10.2h6M7 13.4h3.5" stroke-linecap="round"/></svg>',
  lista: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5.5h12M4 10h12M4 14.5h8" stroke-linecap="round"/></svg>',
  mapa: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 18s6-5.5 6-10.2A6 6 0 104 7.8C4 12.5 10 18 10 18z"/><circle cx="10" cy="7.6" r="2"/></svg>',
  grafico: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 16V9M10 16V4M16 16v-6" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7.3"/><path d="M7 10.2l2.1 2.1L13.3 8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cartao: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="4.5" width="15" height="11" rx="1.6"/><path d="M2.5 8h15" stroke-linecap="round"/></svg>',
  usuarios: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7.2" cy="7" r="2.6"/><path d="M2.3 16c.6-2.8 2.4-4.3 4.9-4.3s4.3 1.5 4.9 4.3" stroke-linecap="round"/><circle cx="14.3" cy="7.4" r="2.1"/><path d="M12.9 11.9c1.9.1 3.3 1.5 3.8 3.9" stroke-linecap="round"/></svg>',
  engrenagem: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v1.9M10 15.3v1.9M17.2 10h-1.9M4.7 10H2.8M15 5l-1.3 1.3M6.3 13.7L5 15M15 15l-1.3-1.3M6.3 6.3L5 5" stroke-linecap="round"/></svg>',
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
    : `<button class="nav-item" data-tela="${item.id}" onclick="irPara('${item.id}')"><span class="nav-icon">${ICONS[item.icone]||''}</span>${item.label}</button>`
  ).join('');

  const inicial = u.perfil === 'faturamento' ? 'aprovados' : 'produtos';
  irPara(inicial);
  sincronizarComServidor().then(recarregarTela); // atualiza com o que houver de mais recente na planilha
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

const TELAS_QUE_RESSINCRONIZAM = ['meus-orcamentos', 'todos-orcamentos', 'aprovados', 'aprovacoes-margem', 'vendedores', 'rotas'];
function irPara(tela){
  TELA_ATUAL = tela;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
  document.getElementById('topbar-titulo').textContent = TITULOS[tela] || '';
  document.getElementById('topbar-acoes').innerHTML = '';
  const fn = RENDERERS[tela];
  document.getElementById('content').innerHTML = fn ? '' : '<div class="empty-state">Tela em construção.</div>';
  if(fn) fn();
  if(TELAS_QUE_RESSINCRONIZAM.includes(tela)){
    sincronizarComServidor().then(() => { if(TELA_ATUAL === tela) recarregarTela(); });
  }
}
function recarregarTela(){
  const fn = RENDERERS[TELA_ATUAL];
  document.getElementById('topbar-titulo').textContent = TITULOS[TELA_ATUAL] || '';
  document.getElementById('content').innerHTML = fn ? '' : '<div class="empty-state">Tela em construção.</div>';
  if(fn) fn();
}

/* ---------------- Regras de negócio compartilhadas ---------------- */
function margemMinima(marca){
  const db = getDB();
  return (db.parametros[marca] && db.parametros[marca].margemMinima) || 0;
}
// Margem de Lucro = Preço de Venda - ICMS(sobre a venda) - PIS/COFINS(9,25%, se o item tiver e houver ICMS informado) - Custo Contábil
const ALIQUOTA_PIS_COFINS = 9.25; // percentual sobre o preço de venda, quando o item é tributado por ICMS e possui PIS/COFINS
function calcularItem({ custoContabil, icmsPct, precoVenda, temPisCofins }){
  custoContabil = Number(custoContabil)||0;
  icmsPct = Number(icmsPct)||0;
  precoVenda = Number(precoVenda)||0;
  const aplicaPisCofins = icmsPct > 0 && !!temPisCofins;
  const valorIcms = precoVenda * (icmsPct/100);
  const valorPisCofins = aplicaPisCofins ? precoVenda * (ALIQUOTA_PIS_COFINS/100) : 0;
  const margemValor = precoVenda - valorIcms - valorPisCofins - custoContabil;
  const margemPct = precoVenda > 0 ? (margemValor / precoVenda) * 100 : 0;
  return { valorIcms, valorPisCofins, aplicaPisCofins, margemValor, margemPct };
}
function precoPorMargemDesejada({ custoContabil, icmsPct, margemPctDesejada, temPisCofins }){
  // PV - PV*icms% - PV*pisCofins% - custo = PV*margem% => PV*(1 - icms% - pisCofins% - margem%) = custo
  custoContabil = Number(custoContabil)||0;
  icmsPct = Number(icmsPct)||0;
  margemPctDesejada = Number(margemPctDesejada)||0;
  const pisCofinsPct = (icmsPct > 0 && temPisCofins) ? ALIQUOTA_PIS_COFINS : 0;
  const fator = 1 - (icmsPct/100) - (pisCofinsPct/100) - (margemPctDesejada/100);
  if(fator <= 0) return custoContabil * 2; // evita divisão inválida quando irreal
  return custoContabil / fator;
}

/* ---------------- Alocação de quantidade entre lojas ---------------- */
// Distribui automaticamente a quantidade desejada pelas lojas disponíveis,
// priorizando a de menor custo, respeitando o estoque de cada uma.
function autoAlocarQuantidade(item){
  const lojas = (item.lojasDisponiveis || []).slice().sort((a,b) => (a.custoContabil||0) - (b.custoContabil||0));
  let restante = Number(item.qtde) || 0;
  const alocacoes = [];
  lojas.forEach(loja => {
    if(restante <= 0) return;
    const estoque = Math.max(0, Number(loja.quantidade) || 0);
    if(estoque <= 0) return;
    const usar = Math.min(estoque, restante);
    alocacoes.push({ empresa: loja.empresa, fornecedor: loja.fornecedor, qtde: usar });
    restante -= usar;
  });
  item.alocacoes = alocacoes;
}
function qtdeAlocadaTotal(item){
  return (item.alocacoes || []).reduce((s,a) => s + (Number(a.qtde)||0), 0);
}
// Custo médio ponderado pelas lojas efetivamente usadas — é o que entra no
// cálculo de margem, já que cada loja pode ter um custo contábil diferente.
function custoMedioAlocado(item){
  const alocacoes = item.alocacoes || [];
  const totalQtde = qtdeAlocadaTotal(item);
  if(totalQtde <= 0){
    const lojas = item.lojasDisponiveis || [];
    return lojas[0] ? (lojas[0].custoContabil || 0) : 0;
  }
  const custoTotal = alocacoes.reduce((s,a) => {
    const loja = (item.lojasDisponiveis || []).find(l => l.empresa === a.empresa);
    return s + (loja ? (loja.custoContabil||0) : 0) * a.qtde;
  }, 0);
  return custoTotal / totalQtde;
}
function formatarAlocacoes(item){
  const alocacoes = item.alocacoes || [];
  if(!alocacoes.length) return '—';
  return alocacoes.map(a => `${a.qtde} un. Loja ${a.empresa}`).join(' + ');
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
