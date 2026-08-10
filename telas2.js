/* ==========================================================================
   Telas 2 — orçamentos (listas), gestão de vendedores, margem, faturamento
   ========================================================================== */

/* =============== MEUS ORÇAMENTOS (Vendedor / Gestor vendo os próprios) =============== */
RENDERERS['meus-orcamentos'] = function(){
  const db = getDB();
  const meus = db.orcamentos.filter(o => o.marca === SESSAO.marca && o.vendedorId === SESSAO.usuario.id);
  renderListaOrcamentos(meus, { permitirEditar:true, permitirAprovar:true, titulo:'meus-orcamentos' });
};

/* =============== TODOS OS ORÇAMENTOS (Gestor) =============== */
RENDERERS['todos-orcamentos'] = function(){
  const db = getDB();
  const todos = db.orcamentos.filter(o => o.marca === SESSAO.marca);
  renderListaOrcamentos(todos, { permitirEditar:false, permitirAprovar:false, mostrarVendedor:true, titulo:'todos-orcamentos' });
};

/* =============== ORÇAMENTOS APROVADOS (Faturamento) =============== */
RENDERERS['aprovados'] = function(){
  const db = getDB();
  const aprovados = db.orcamentos.filter(o => o.marca === SESSAO.marca && (o.status === 'aprovado' || o.status === 'faturado'));
  renderListaOrcamentos(aprovados, { permitirEditar:false, permitirFaturar:true, mostrarVendedor:true, titulo:'aprovados' });
};

let FILTRO_STATUS_ORC = 'todos';
function renderListaOrcamentos(lista, opts){
  FILTRO_STATUS_ORC = FILTRO_STATUS_ORC || 'todos';
  const filtros = ['todos','rascunho','aguardando_margem','pendente','aprovado','faturado','recusado_margem'];
  const filtrada = FILTRO_STATUS_ORC === 'todos' ? lista : lista.filter(o => o.status === FILTRO_STATUS_ORC);
  filtrada.sort((a,b) => new Date(b.dataCriacao||0) - new Date(a.dataCriacao||0));

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar">
      <div class="pill-filtros" id="pills-status"></div>
    </div>
    ${filtrada.length === 0 ? `<div class="empty-state"><h3>Nenhum orçamento aqui</h3><p>Os orçamentos aparecem aqui assim que forem criados.</p></div>` : `
    <div class="card" style="padding:0;overflow-x:auto;">
      <table class="tabela-responsiva">
        <thead><tr>
          <th>Cliente</th>${opts.mostrarVendedor?'<th>Vendedor</th>':''}<th>Itens</th><th>Total</th><th>Status</th><th>NF</th><th>Criado em</th><th></th>
        </tr></thead>
        <tbody>
          ${filtrada.map(o => renderLinhaOrcamento(o, opts)).join('')}
        </tbody>
      </table>
    </div>`}
  `;
  const pillsHtml = filtros.map(f => `<button class="pill ${FILTRO_STATUS_ORC===f?'ativo':''}" onclick="mudarFiltroStatus('${f}')">${f==='todos'?'Todos':statusInfo(f).label}</button>`).join('');
  document.getElementById('pills-status').innerHTML = pillsHtml;
}
function mudarFiltroStatus(f){ FILTRO_STATUS_ORC = f; recarregarTela(); }

function renderLinhaOrcamento(o, opts){
  const total = o.itens.reduce((s,i)=>s+i.precoVenda*i.qtde,0);
  const info = statusInfo(o.status);
  const vencido = orcamentoVencido(o);
  const acoes = [];
  if(opts.permitirEditar && ['rascunho','pendente','aprovado'].includes(o.status)){
    acoes.push(`<button class="btn btn-outline btn-sm" onclick="editarOrcamento('${o.id}')">Editar</button>`);
  }
  if(opts.permitirAprovar && o.status === 'pendente'){
    acoes.push(`<button class="btn btn-gold btn-sm" onclick="marcarComoAprovado('${o.id}')">Marcar como Aprovado</button>`);
  }
  if(opts.permitirFaturar && o.status === 'aprovado'){
    acoes.push(`<button class="btn btn-primary btn-sm" onclick="abrirModalFaturar('${o.id}')">Faturar</button>`);
  }
  acoes.push(`<button class="btn btn-outline btn-sm" onclick="visualizarOrcamento('${o.id}')">Ver</button>`);

  return `
    <tr>
      <td data-label="Cliente"><strong>${o.cliente.nome || '—'}</strong><br><span style="font-size:12px;color:var(--gray-500);">${o.cliente.telefone||''}</span></td>
      ${opts.mostrarVendedor ? `<td data-label="Vendedor">${o.vendedorNome}</td>` : ''}
      <td data-label="Itens">${o.itens.length}</td>
      <td data-label="Total">${fmtMoeda(total)}</td>
      <td data-label="Status">
        <span class="badge ${info.cls}">${info.label}</span>
        ${vencido ? '<br><span class="badge badge-vermelho" style="margin-top:4px;">Prazo de 7 dias vencido</span>' : ''}
        ${o.alteradoAposEnvio ? '<br><span class="badge badge-amber" style="margin-top:4px;">⚠️ Alterado após envio</span>' : ''}
      </td>
      <td data-label="NF">${o.nf || '—'}</td>
      <td data-label="Criado em" style="white-space:nowrap;font-size:12.5px;">${fmtData(o.dataCriacao)}</td>
      <td data-label="" style="white-space:nowrap;">${acoes.join(' ')}</td>
    </tr>
  `;
}

function editarOrcamento(id){
  const db = getDB();
  const o = db.orcamentos.find(x => x.id === id);
  if(!o) return;
  ORCAMENTO_EM_EDICAO = JSON.parse(JSON.stringify(o));
  ORCAMENTO_EM_EDICAO.statusAntesEdicao = o.status;
  irPara('novo-orcamento');
}
function marcarComoAprovado(id){
  if(!confirm('Confirmar que o cliente fechou este orçamento? Ele será enviado para o faturamento.')) return;
  const db = getDB();
  const o = db.orcamentos.find(x => x.id === id);
  o.status = 'aprovado';
  o.dataAprovacao = new Date().toISOString();
  o.alteradoAposEnvio = false;
  setDB(db);
  sincronizarRegistro('Orcamentos', o);
  toast('Orçamento aprovado e enviado ao faturamento', 'sucesso');
  recarregarTela();
}
function abrirModalFaturar(id){
  abrirModal(`
    <button class="modal-close" onclick="fecharModal()">&times;</button>
    <h3>Faturar orçamento</h3>
    <p style="font-size:13.5px;color:var(--gray-500);">Informe o número da Nota Fiscal para concluir o faturamento. O vendedor e a gestão verão esse número.</p>
    <div class="campo"><label>Número da Nota Fiscal</label><input type="text" id="input-nf" autofocus></div>
    <button class="btn btn-primary btn-block" onclick="confirmarFaturamento('${id}')">Confirmar Faturamento</button>
  `);
}
function confirmarFaturamento(id){
  const nf = document.getElementById('input-nf').value.trim();
  if(!nf){ toast('Informe o número da NF', 'erro'); return; }
  const db = getDB();
  const o = db.orcamentos.find(x => x.id === id);
  o.status = 'faturado';
  o.nf = nf;
  o.dataFaturamento = new Date().toISOString();
  o.alteradoAposEnvio = false;
  setDB(db);
  sincronizarRegistro('Orcamentos', o);
  fecharModal();
  toast('Orçamento faturado com sucesso', 'sucesso');
  recarregarTela();
}
function visualizarOrcamento(id){
  const db = getDB();
  const o = db.orcamentos.find(x => x.id === id);
  const total = o.itens.reduce((s,i)=>s+i.precoVenda*i.qtde,0);
  abrirModal(`
    <button class="modal-close" onclick="fecharModal()">&times;</button>
    <h3>Orçamento — ${o.cliente.nome || '—'}</h3>
    <p style="font-size:13px;color:var(--gray-500);">Vendedor: ${o.vendedorNome} · Criado em ${fmtData(o.dataCriacao)}</p>
    <table style="width:100%;font-size:13px;margin-bottom:14px;">
      <thead><tr><th style="text-align:left;">Código</th><th style="text-align:left;">Descrição</th><th>Qtde</th><th>Preço</th></tr></thead>
      <tbody>
        ${o.itens.map(i=>`<tr><td>${i.codigo}</td><td>${i.descricao}</td><td style="text-align:center;">${i.qtde}</td><td style="text-align:right;">${fmtMoeda(i.precoVenda)}</td></tr>`).join('')}
      </tbody>
    </table>
    <p><strong>Total:</strong> ${fmtMoeda(total)} &nbsp; <strong>Status:</strong> ${statusInfo(o.status).label} ${o.nf ? '&nbsp; <strong>NF:</strong> '+o.nf : ''}</p>
  `);
}

/* =============== APROVAÇÕES DE MARGEM (Gestor) =============== */
RENDERERS['aprovacoes-margem'] = function(){
  const db = getDB();
  const pendentes = db.orcamentos.filter(o => o.marca === SESSAO.marca && o.status === 'aguardando_margem');
  const content = document.getElementById('content');
  const min = margemMinima(SESSAO.marca);
  content.innerHTML = pendentes.length === 0
    ? `<div class="empty-state"><h3>Nenhuma aprovação pendente</h3><p>Orçamentos com margem abaixo de ${min}% aparecem aqui.</p></div>`
    : pendentes.map(o => {
        const total = o.itens.reduce((s,i)=>s+i.precoVenda*i.qtde,0);
        const itensAbaixo = o.itens.filter(i => calcularItem({ custoContabil: custoDaLojaSelecionada(i), icmsPct: i.icmsPct, precoVenda: i.precoVenda, temPisCofins: i.temPisCofins }).margemPct < min);
        return `
        <div class="card">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div>
              <strong>${o.cliente.nome || '—'}</strong> · vendedor ${o.vendedorNome}<br>
              <span style="font-size:12.5px;color:var(--gray-500);">Total do orçamento: ${fmtMoeda(total)}</span>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-danger btn-sm" onclick="recusarMargem('${o.id}')">Recusar</button>
              <button class="btn btn-gold btn-sm" onclick="aprovarMargem('${o.id}')">Aprovar margem</button>
            </div>
          </div>
          <table style="width:100%;margin-top:14px;font-size:13px;">
            <thead><tr><th style="text-align:left;">Item</th><th>Custo</th><th>ICMS</th><th>Preço</th><th>Margem</th></tr></thead>
            <tbody>
              ${itensAbaixo.map(i => { const custoContabil = custoDaLojaSelecionada(i); const c = calcularItem({ custoContabil, icmsPct: i.icmsPct, precoVenda: i.precoVenda, temPisCofins: i.temPisCofins }); return `
                <tr><td>${i.codigo} — ${i.descricao}</td><td style="text-align:center;">${fmtMoeda(custoContabil)}</td><td style="text-align:center;">${i.icmsPct}%</td><td style="text-align:center;">${fmtMoeda(i.precoVenda)}</td><td style="text-align:center;color:var(--red);font-weight:700;">${c.margemPct.toFixed(1)}%</td></tr>
              `; }).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('');
};
function aprovarMargem(id){
  const db = getDB();
  const o = db.orcamentos.find(x => x.id === id);
  o.status = 'pendente';
  setDB(db);
  sincronizarRegistro('Orcamentos', o);
  toast('Margem aprovada. O vendedor já pode seguir com o orçamento.', 'sucesso');
  recarregarTela();
}
function recusarMargem(id){
  const db = getDB();
  const o = db.orcamentos.find(x => x.id === id);
  o.status = 'recusado_margem';
  setDB(db);
  sincronizarRegistro('Orcamentos', o);
  toast('Margem recusada. O vendedor foi sinalizado.', 'erro');
  recarregarTela();
}

/* =============== CADASTRO DE VENDEDORES (Gestor) =============== */
RENDERERS['vendedores'] = function(){
  const db = getDB();
  const usuarios = db.usuarios.filter(u => u.marca === SESSAO.marca);
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar"><button class="btn btn-primary" onclick="abrirModalUsuario()">+ Novo acesso</button></div>
    <div class="card" style="padding:0;overflow-x:auto;">
      <table>
        <thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Telefone</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${usuarios.map(u => `
            <tr>
              <td>${u.nome}</td>
              <td>${u.login}</td>
              <td><span class="badge badge-cinza">${{gestor:'Gestor',vendedor:'Vendedor',faturamento:'Faturamento'}[u.perfil]}</span></td>
              <td>${u.telefone||'—'}</td>
              <td><span class="badge ${u.status==='ativo'?'badge-verde':'badge-vermelho'}">${u.status==='ativo'?'Ativo':'Inativo'}</span></td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="abrirModalUsuario('${u.id}')">Editar</button>
                <button class="btn btn-outline btn-sm" onclick="alternarStatusUsuario('${u.id}')">${u.status==='ativo'?'Desativar':'Ativar'}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
};
function abrirModalUsuario(id){
  const db = getDB();
  const u = id ? db.usuarios.find(x=>x.id===id) : { nome:'',login:'',senha:'',telefone:'',perfil:'vendedor' };
  abrirModal(`
    <button class="modal-close" onclick="fecharModal()">&times;</button>
    <h3>${id ? 'Editar acesso' : 'Novo acesso'} — ${SESSAO.marca}</h3>
    <div class="campo"><label>Nome</label><input type="text" id="uf-nome" value="${u.nome}"></div>
    <div class="campo"><label>Login</label><input type="text" id="uf-login" value="${u.login}"></div>
    <div class="campo"><label>Senha</label><input type="text" id="uf-senha" value="${u.senha}"></div>
    <div class="campo"><label>Telefone</label><input type="text" id="uf-telefone" value="${u.telefone}" placeholder="(62) 90000-0000"></div>
    <div class="campo"><label>Perfil</label>
      <select id="uf-perfil">
        <option value="vendedor" ${u.perfil==='vendedor'?'selected':''}>Vendedor</option>
        <option value="gestor" ${u.perfil==='gestor'?'selected':''}>Gestor</option>
        <option value="faturamento" ${u.perfil==='faturamento'?'selected':''}>Faturamento</option>
      </select>
    </div>
    <button class="btn btn-primary btn-block" onclick="salvarUsuario('${id||''}')">Salvar</button>
  `);
}
function salvarUsuario(id){
  const nome = document.getElementById('uf-nome').value.trim();
  const login = document.getElementById('uf-login').value.trim();
  const senha = document.getElementById('uf-senha').value.trim();
  const telefone = document.getElementById('uf-telefone').value.trim();
  const perfil = document.getElementById('uf-perfil').value;
  if(!nome || !login || !senha){ toast('Preencha nome, login e senha', 'erro'); return; }
  const db = getDB();
  let registroSalvo;
  if(id){
    const u = db.usuarios.find(x=>x.id===id);
    Object.assign(u, { nome, login, senha, telefone, perfil });
    registroSalvo = u;
  } else {
    if(db.usuarios.some(x=>x.login.toLowerCase()===login.toLowerCase() && x.marca===SESSAO.marca)){
      toast('Já existe um login com esse nome nesta marca', 'erro'); return;
    }
    registroSalvo = { id: novoId(), nome, login, senha, telefone, perfil, marca: SESSAO.marca, status:'ativo' };
    db.usuarios.push(registroSalvo);
  }
  setDB(db);
  sincronizarRegistro('Usuarios', registroSalvo);
  fecharModal();
  toast('Acesso salvo', 'sucesso');
  recarregarTela();
}
function alternarStatusUsuario(id){
  const db = getDB();
  const u = db.usuarios.find(x=>x.id===id);
  u.status = u.status === 'ativo' ? 'inativo' : 'ativo';
  setDB(db);
  sincronizarRegistro('Usuarios', u);
  recarregarTela();
}

/* =============== PARÂMETROS DE MARGEM (Gestor) =============== */
RENDERERS['parametros'] = function(){
  const db = getDB();
  const atual = db.parametros[SESSAO.marca].margemMinima;
  document.getElementById('content').innerHTML = `
    <div class="card" style="max-width:420px;">
      <h3 style="margin-top:0;">Margem mínima — ${SESSAO.marca}</h3>
      <p style="font-size:13px;color:var(--gray-500);">Orçamentos com itens abaixo desta margem líquida vão para aprovação da gestão antes de seguir.</p>
      <div class="campo"><label>Margem mínima (%)</label><input type="number" step="0.1" id="margem-min-input" value="${atual}"></div>
      <button class="btn btn-primary" onclick="salvarMargemMinima()">Salvar</button>
    </div>
  `;
};
function salvarMargemMinima(){
  const valor = Number(document.getElementById('margem-min-input').value) || 0;
  const db = getDB();
  db.parametros[SESSAO.marca].margemMinima = valor;
  setDB(db);
  sincronizarRegistro('Parametros', { marca: SESSAO.marca, margemMinima: valor });
  toast('Margem mínima atualizada', 'sucesso');
};
