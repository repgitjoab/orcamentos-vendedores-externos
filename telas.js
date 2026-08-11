/* ==========================================================================
   Telas do app — cada função monta o HTML dentro de #content
   ========================================================================== */

/* =============== CONSULTA DE PRODUTOS =============== */
RENDERERS['produtos'] = function(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar">
      <input type="search" id="busca-produto" placeholder="Buscar por código ou descrição..." oninput="filtrarProdutos()">
      <span class="badge badge-cinza" id="contagem-produtos"></span>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;">
      <table class="tabela-responsiva">
        <thead><tr>
          <th>Código</th><th>Descrição</th><th>Preço Tabela</th><th></th>
        </tr></thead>
        <tbody id="tbody-produtos"></tbody>
      </table>
    </div>
    <div id="paginacao-produtos" style="text-align:center;color:var(--gray-500);font-size:13px;margin-top:10px;"></div>
  `;
  window._prodPage = 0;
  filtrarProdutos();
};

function filtrarProdutos(){
  const termo = (document.getElementById('busca-produto').value || '').toLowerCase().trim();
  const base = produtosAgrupados(SESSAO.marca);
  let resultado = base;
  if(termo){
    resultado = base.filter(p => p.codigo.toLowerCase().includes(termo) || p.descricao.toLowerCase().includes(termo));
  }
  window._prodResultado = resultado;
  window._prodPage = 0;
  document.getElementById('contagem-produtos').textContent = resultado.length + ' item(ns)';
  renderPaginaProdutos();
}
function renderPaginaProdutos(){
  const PAGE_SIZE = 50;
  const resultado = window._prodResultado || [];
  const pagina = window._prodPage || 0;
  const inicio = pagina * PAGE_SIZE;
  const fatia = resultado.slice(inicio, inicio + PAGE_SIZE);
  const tbody = document.getElementById('tbody-produtos');
  if(fatia.length === 0){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">
      <h3>Nenhum produto encontrado</h3><p>Tente buscar por outro código ou palavra da descrição.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = fatia.map(p => {
      const preco = melhorPrecoProduto(p);
      const qtdLojas = p.lojas.length;
      return `
      <tr>
        <td data-label="Código"><strong>${p.codigo}</strong></td>
        <td data-label="Descrição">${p.descricao} ${qtdLojas>1?`<span class="badge badge-cinza" style="margin-left:6px;">${qtdLojas} lojas</span>`:''}</td>
        <td data-label="Preço Tabela">${fmtMoeda(preco)}</td>
        <td data-label=""><button class="btn btn-gold btn-sm" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g,"&#39;")})'>+ Orçamento</button></td>
      </tr>
    `;}).join('');
  }
  const totalPaginas = Math.max(1, Math.ceil(resultado.length / PAGE_SIZE));
  const nav = document.getElementById('paginacao-produtos');
  nav.innerHTML = `
    <button class="btn btn-outline btn-sm" ${pagina<=0?'disabled':''} onclick="mudarPaginaProdutos(-1)">&larr; Anterior</button>
    &nbsp; Página ${pagina+1} de ${totalPaginas} &nbsp;
    <button class="btn btn-outline btn-sm" ${pagina>=totalPaginas-1?'disabled':''} onclick="mudarPaginaProdutos(1)">Próxima &rarr;</button>
  `;
}
function melhorPrecoProduto(p){
  const precos = p.lojas.map(l => l.precoVendaIC || l.precoVendaFor).filter(v => v > 0);
  return precos.length ? Math.min(...precos) : 0;
}
function lojaMaisBarata(p){
  return p.lojas.reduce((melhor, l) => (!melhor || l.custoContabil < melhor.custoContabil) ? l : melhor, null);
}
function mudarPaginaProdutos(delta){ window._prodPage = (window._prodPage||0) + delta; renderPaginaProdutos(); }

function garantirOrcamentoEmEdicao(){
  if(!ORCAMENTO_EM_EDICAO){
    ORCAMENTO_EM_EDICAO = {
      id: null,
      marca: SESSAO.marca,
      vendedorId: SESSAO.usuario.id,
      vendedorNome: SESSAO.usuario.nome,
      vendedorTelefone: SESSAO.usuario.telefone,
      cliente: { nome:'', telefone:'', cnpjCpf:'' },
      itens: [],
      status: 'rascunho',
      dataCriacao: null,
      dataAprovacao: null,
      dataFaturamento: null,
      nf: '',
      alteradoAposEnvio: false
    };
  }
  return ORCAMENTO_EM_EDICAO;
}
function adicionarAoOrcamento(produto){
  const orc = garantirOrcamentoEmEdicao();
  const existente = orc.itens.find(i => i.codigo === produto.codigo);
  if(existente){
    existente.qtde += 1;
    autoAlocarQuantidade(existente);
  } else {
    const precoBase = melhorPrecoProduto(produto) || (lojaMaisBarata(produto)||{}).custoContabil || 0;
    const novoItem = {
      codigo: produto.codigo,
      descricao: produto.descricao,
      qtde: 1,
      icmsPct: 0,
      precoVenda: Number(precoBase.toFixed(2)),
      temPisCofins: !!(produto.possuiPis || produto.possuiCofins),
      lojasDisponiveis: produto.lojas,
      alocacoes: [],
    };
    autoAlocarQuantidade(novoItem);
    orc.itens.push(novoItem);
  }
  toast('Item adicionado ao orçamento', 'sucesso');
  irPara('novo-orcamento');
}

/* =============== NOVO ORÇAMENTO (carrinho) =============== */
RENDERERS['novo-orcamento'] = function(){
  const orc = garantirOrcamentoEmEdicao();
  renderNovoOrcamento(orc);
};

function renderNovoOrcamento(orc){
  const content = document.getElementById('content');
  const minMargem = margemMinima(SESSAO.marca);

  let totalGeral = 0;
  let algumaMargemAbaixo = false;
  const linhasItens = orc.itens.map((item, idx) => {
    const custoContabil = custoMedioAlocado(item);
    const calc = calcularItem({ custoContabil, icmsPct: item.icmsPct, precoVenda: item.precoVenda, temPisCofins: item.temPisCofins });
    const subtotal = item.precoVenda * item.qtde;
    totalGeral += subtotal;
    if(calc.margemPct < minMargem) algumaMargemAbaixo = true;
    const margemBaixaCls = calc.margemPct < minMargem ? 'color:var(--red);font-weight:700;' : 'color:var(--green);font-weight:700;';
    const lojas = item.lojasDisponiveis || [];
    const alocado = qtdeAlocadaTotal(item);
    const faltaAlocar = item.qtde - alocado;

    const linhaPrincipal = `
      <tr>
        <td data-label="Item">
          <strong>${item.codigo}</strong><br>
          <span style="font-size:12px;color:var(--gray-500);">${item.descricao}</span>
          ${item.temPisCofins ? '<br><span class="badge badge-cinza" style="margin-top:3px;">PIS/COFINS 9,25%</span>' : ''}
        </td>
        <td data-label="Qtde" class="td-input"><input type="number" min="1" value="${item.qtde}" onchange="atualizarItem(${idx},'qtde',this.value)"></td>
        <td data-label="ICMS (%)" class="td-input"><input type="number" step="0.01" min="0" value="${item.icmsPct}" onchange="atualizarItem(${idx},'icmsPct',this.value)"></td>
        <td data-label="Preço Venda" class="td-input"><input type="number" step="0.01" min="0" value="${item.precoVenda}" onchange="atualizarItem(${idx},'precoVenda',this.value)"></td>
        <td data-label="Margem desejada (%)" class="td-input">
          <input type="number" step="0.01" placeholder="%" onchange="atualizarPorMargem(${idx},this.value)">
        </td>
        <td data-label="Margem obtida" style="${margemBaixaCls}">${calc.margemPct.toFixed(1)}%</td>
        <td data-label="Subtotal"><strong>${fmtMoeda(subtotal)}</strong></td>
        <td data-label=""><button class="btn btn-danger btn-sm" onclick="removerItem(${idx})">✕ Remover</button></td>
      </tr>`;

    const linhasLoja = lojas.map(l => {
      const alocEntry = (item.alocacoes||[]).find(a => a.empresa === l.empresa);
      const qtdeUsada = alocEntry ? alocEntry.qtde : 0;
      const estoque = Math.max(0, Number(l.quantidade)||0);
      const semEstoque = estoque <= 0;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;flex-wrap:wrap;">
          <span style="min-width:230px;font-size:12.5px;${semEstoque?'color:var(--gray-500);':''}">
            <strong>Loja ${l.empresa}</strong> — ${l.fornecedor || 'fornecedor não informado'}
            <br><span style="color:${semEstoque?'var(--red)':'var(--gray-500)'};">${estoque} un. em estoque</span>
          </span>
          <input type="number" min="0" max="${estoque}" value="${qtdeUsada}" ${semEstoque?'disabled':''}
            style="width:80px;padding:6px 8px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;"
            onchange="alterarAlocacaoLoja(${idx}, '${l.empresa}', this.value)">
          <span style="font-size:12px;color:var(--gray-500);">un. desta loja &nbsp;·&nbsp; custo ${fmtMoeda(l.custoContabil)}</span>
        </div>`;
    }).join('');

    const linhaDetalhe = `
      <tr>
        <td colspan="8" style="background:var(--gray-100);padding:12px 16px;">
          <div style="font-size:12px;font-weight:700;color:var(--gray-700);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">
            De qual loja sai cada unidade
          </div>
          ${linhasLoja}
          <div style="margin-top:6px;font-size:12.5px;${faltaAlocar>0?'color:var(--red);font-weight:700;':faltaAlocar<0?'color:var(--amber);font-weight:700;':'color:var(--green);font-weight:700;'}">
            ${faltaAlocar>0
              ? `⚠️ Faltam ${faltaAlocar} unidade(s) para alocar — o estoque somado das lojas não cobre a quantidade pedida.`
              : faltaAlocar<0
                ? `⚠️ Alocado a mais: reduza ${-faltaAlocar} unidade(s) para bater com a quantidade pedida.`
                : `✓ ${alocado} de ${item.qtde} unidades alocadas — ${formatarAlocacoes(item)}`}
            ${lojas.length>1 ? ` &nbsp;<button class="btn btn-outline btn-sm" style="margin-left:8px;" onclick="redistribuirAutomaticamente(${idx})">Redistribuir automaticamente</button>` : ''}
          </div>
        </td>
      </tr>`;

    return linhaPrincipal + linhaDetalhe;
  }).join('');

  content.innerHTML = `
    ${algumaMargemAbaixo ? `<div class="alerta-caixa">⚠️ Um ou mais itens estão com margem abaixo do mínimo parametrizado pela gestão (${minMargem}%). Ao enviar, este orçamento vai para aprovação da gestão antes de seguir.</div>` : ''}

    <div class="card">
      <h3 style="margin-top:0;">Dados do Cliente</h3>
      <div class="grid-3">
        <div class="campo"><label>Nome do cliente</label><input type="text" id="cli-nome" value="${orc.cliente.nome}" onchange="orcAtualizarCliente('nome',this.value)"></div>
        <div class="campo"><label>Telefone</label><input type="text" id="cli-telefone" value="${orc.cliente.telefone}" onchange="orcAtualizarCliente('telefone',this.value)"></div>
        <div class="campo"><label>CNPJ/CPF (opcional)</label><input type="text" id="cli-doc" value="${orc.cliente.cnpjCpf}" onchange="orcAtualizarCliente('cnpjCpf',this.value)"></div>
      </div>
    </div>

    <div class="toolbar" style="justify-content:space-between;">
      <h3 style="margin:0;">Itens do Orçamento</h3>
      <button class="btn btn-gold" onclick="abrirModalAdicionarProduto()">+ Incluir produto</button>
    </div>

    <div class="card" style="padding:0;overflow-x:auto;">
      <table class="tabela-responsiva tabela-carrinho">
        <thead><tr>
          <th>Item</th><th>Qtde</th><th>ICMS</th><th>Preço Venda</th><th>Margem desejada</th><th>Margem obtida</th><th>Subtotal</th><th></th>
        </tr></thead>
        <tbody>
          ${orc.itens.length ? linhasItens : `<tr><td colspan="8"><div class="empty-state"><h3>Nenhum item ainda</h3><p>Clique em "+ Incluir produto" acima para adicionar itens aqui.</p></div></td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="card total-orcamento-card">
      <div>
        <div style="font-size:12.5px;color:var(--gray-500);font-weight:700;">TOTAL DO ORÇAMENTO</div>
        <div style="font-family:'Poppins';font-size:28px;font-weight:800;color:var(--gold-deep);">${fmtMoeda(totalGeral)}</div>
      </div>
      <div class="acoes-orcamento">
        <button class="btn btn-outline" onclick="limparOrcamentoEmEdicao()">Limpar</button>
        <button class="btn btn-outline" onclick="gerarPDF()" ${orc.itens.length?'':'disabled'}>Exportar PDF</button>
        <button class="btn btn-outline" onclick="gerarPNG()" ${orc.itens.length?'':'disabled'}>Exportar PNG</button>
        <button class="btn btn-primary" onclick="salvarOrcamento()" ${orc.itens.length?'':'disabled'}>${orc.id ? 'Salvar alterações' : 'Salvar orçamento'}</button>
      </div>
    </div>
  `;
}

function custoDaLojaSelecionada(item){
  // mantido por compatibilidade com itens antigos salvos antes da alocação por loja
  return custoMedioAlocado(item);
}
function atualizarItem(idx, campo, valor){
  const orc = garantirOrcamentoEmEdicao();
  const item = orc.itens[idx];
  item[campo] = campo === 'qtde' ? Math.max(1, parseInt(valor)||1) : Number(valor)||0;
  if(campo === 'qtde') autoAlocarQuantidade(item);
  renderNovoOrcamento(orc);
}
function alterarAlocacaoLoja(idx, empresa, valor){
  const orc = garantirOrcamentoEmEdicao();
  const item = orc.itens[idx];
  const loja = (item.lojasDisponiveis||[]).find(l => l.empresa === empresa);
  const estoque = loja ? Math.max(0, Number(loja.quantidade)||0) : 0;
  const novaQtde = Math.max(0, Math.min(estoque, parseInt(valor)||0));
  item.alocacoes = item.alocacoes || [];
  const existente = item.alocacoes.find(a => a.empresa === empresa);
  if(existente){
    existente.qtde = novaQtde;
  } else if(novaQtde > 0){
    item.alocacoes.push({ empresa, fornecedor: loja ? loja.fornecedor : '', qtde: novaQtde });
  }
  item.alocacoes = item.alocacoes.filter(a => a.qtde > 0);
  renderNovoOrcamento(orc);
}
function redistribuirAutomaticamente(idx){
  const orc = garantirOrcamentoEmEdicao();
  autoAlocarQuantidade(orc.itens[idx]);
  renderNovoOrcamento(orc);
}
function atualizarPorMargem(idx, margemDesejada){
  const orc = garantirOrcamentoEmEdicao();
  const item = orc.itens[idx];
  const custoContabil = custoDaLojaSelecionada(item);
  const novoPreco = precoPorMargemDesejada({ custoContabil, icmsPct: item.icmsPct, margemPctDesejada: Number(margemDesejada)||0, temPisCofins: item.temPisCofins });
  item.precoVenda = Number(novoPreco.toFixed(2));
  renderNovoOrcamento(orc);
}
function removerItem(idx){
  const orc = garantirOrcamentoEmEdicao();
  orc.itens.splice(idx,1);
  renderNovoOrcamento(orc);
}
function orcAtualizarCliente(campo, valor){
  const orc = garantirOrcamentoEmEdicao();
  orc.cliente[campo] = valor;
}
function limparOrcamentoEmEdicao(){
  if(!confirm('Deseja descartar este orçamento e começar do zero?')) return;
  ORCAMENTO_EM_EDICAO = null;
  irPara('novo-orcamento');
}

/* ---- Incluir produto sem sair da tela do orçamento ---- */
function abrirModalAdicionarProduto(){
  abrirModal(`
    <button class="modal-close" onclick="fecharModalAdicionarProduto()">&times;</button>
    <h3 style="margin-top:0;">Incluir produto no orçamento</h3>
    <input type="search" id="busca-produto-modal" placeholder="Buscar por código ou descrição..." style="width:100%;padding:10px 12px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;margin-bottom:12px;" oninput="filtrarProdutosModal()" autofocus>
    <div id="resultados-produto-modal" style="max-height:340px;overflow-y:auto;"></div>
    <button class="btn btn-primary btn-block" style="margin-top:14px;" onclick="fecharModalAdicionarProduto()">Concluir</button>
  `);
  filtrarProdutosModal();
}
function fecharModalAdicionarProduto(){
  fecharModal();
  renderNovoOrcamento(garantirOrcamentoEmEdicao());
}
function filtrarProdutosModal(){
  const termo = (document.getElementById('busca-produto-modal').value || '').toLowerCase().trim();
  const base = produtosAgrupados(SESSAO.marca);
  const resultado = termo ? base.filter(p => p.codigo.toLowerCase().includes(termo) || p.descricao.toLowerCase().includes(termo)) : base;
  const fatia = resultado.slice(0, 30);
  const el = document.getElementById('resultados-produto-modal');
  if(fatia.length === 0){
    el.innerHTML = `<div class="empty-state" style="padding:20px;"><p>Nenhum produto encontrado.</p></div>`;
    return;
  }
  el.innerHTML = fatia.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--gray-100);">
      <div style="min-width:0;">
        <strong>${p.codigo}</strong> ${p.lojas.length>1?`<span class="badge badge-cinza">${p.lojas.length} lojas</span>`:''}<br>
        <span style="font-size:12.5px;color:var(--gray-500);">${p.descricao}</span><br>
        <span style="font-size:12.5px;">${fmtMoeda(melhorPrecoProduto(p))}</span>
      </div>
      <button class="btn btn-gold btn-sm" style="flex-shrink:0;" onclick='adicionarAoOrcamentoDoModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>+ Incluir</button>
    </div>
  `).join('') + (resultado.length > 30 ? `<div style="text-align:center;font-size:12px;color:var(--gray-500);padding:8px;">Mostrando 30 de ${resultado.length} — refine a busca para ver mais.</div>` : '');
}
function adicionarAoOrcamentoDoModal(produto){
  const orc = garantirOrcamentoEmEdicao();
  const existente = orc.itens.find(i => i.codigo === produto.codigo);
  if(existente){
    existente.qtde += 1;
    autoAlocarQuantidade(existente);
  } else {
    const precoBase = melhorPrecoProduto(produto) || (lojaMaisBarata(produto)||{}).custoContabil || 0;
    const novoItem = {
      codigo: produto.codigo,
      descricao: produto.descricao,
      qtde: 1,
      icmsPct: 0,
      precoVenda: Number(precoBase.toFixed(2)),
      temPisCofins: !!(produto.possuiPis || produto.possuiCofins),
      lojasDisponiveis: produto.lojas,
      alocacoes: [],
    };
    autoAlocarQuantidade(novoItem);
    orc.itens.push(novoItem);
  }
  toast('Item incluído', 'sucesso');
}

function salvarOrcamento(){
  const orc = garantirOrcamentoEmEdicao();
  if(!orc.cliente.nome){ toast('Informe o nome do cliente', 'erro'); return; }
  const itemComFalta = orc.itens.find(item => qtdeAlocadaTotal(item) !== item.qtde);
  if(itemComFalta){
    toast(`Ajuste a alocação de lojas do item ${itemComFalta.codigo} antes de salvar`, 'erro');
    return;
  }
  const min = margemMinima(SESSAO.marca);
  const foiEnviadoAntes = !!orc.id && ['aprovado'].includes(orc.statusAntesEdicao);
  const algumaAbaixo = orc.itens.some(item => calcularItem({ custoContabil: custoMedioAlocado(item), icmsPct: item.icmsPct, precoVenda: item.precoVenda, temPisCofins: item.temPisCofins }).margemPct < min);

  const db = getDB();
  const jaExiste = orc.id ? db.orcamentos.find(o => o.id === orc.id) : null;

  if(jaExiste && jaExiste.status === 'aprovado'){
    // edição pós-envio ao faturamento, NF ainda não emitida
    jaExiste.itens = orc.itens;
    jaExiste.cliente = orc.cliente;
    jaExiste.alteradoAposEnvio = true;
    setDB(db);
    sincronizarRegistro('Orcamentos', jaExiste);
    toast('Orçamento atualizado. O faturamento foi sinalizado sobre a alteração.', 'sucesso');
    ORCAMENTO_EM_EDICAO = null;
    irPara('meus-orcamentos');
    return;
  }

  if(algumaAbaixo){
    orc.status = 'aguardando_margem';
  } else {
    orc.status = orc.status === 'aguardando_margem' ? 'pendente' : (orc.status === 'rascunho' ? 'pendente' : orc.status);
  }

  if(jaExiste){
    Object.assign(jaExiste, orc);
    setDB(db);
    sincronizarRegistro('Orcamentos', jaExiste);
    toast('Orçamento atualizado', 'sucesso');
  } else {
    orc.id = novoId();
    orc.dataCriacao = new Date().toISOString();
    db.orcamentos.push(orc);
    setDB(db);
    sincronizarRegistro('Orcamentos', orc);
    toast(orc.status === 'aguardando_margem' ? 'Orçamento enviado para aprovação de margem da gestão' : 'Orçamento salvo', 'sucesso');
  }
  ORCAMENTO_EM_EDICAO = null;
  irPara('meus-orcamentos');
}

/* =============== EXPORTAÇÃO PDF / PNG (layout no padrão Jorlan) =============== */
function montarHtmlExportacao(orc){
  const total = orc.itens.reduce((s,i) => s + i.precoVenda * i.qtde, 0);
  const cor = SESSAO.marca === 'Renault' ? '#FDB913' : '#C9A227';
  const hoje = new Date().toLocaleDateString('pt-BR');
  const linhas = orc.itens.map(item => `
    <tr>
      <td style="padding:14px 12px;font-weight:700;">${item.codigo}</td>
      <td style="padding:14px 12px;">${item.descricao}</td>
      <td style="padding:14px 12px;text-align:center;">${item.qtde}</td>
      <td style="padding:14px 12px;text-align:right;">${fmtMoeda(item.precoVenda)}</td>
      <td style="padding:14px 12px;text-align:center;">
        <span style="background:#E6F4EA;color:#1E8E3E;padding:4px 12px;border-radius:14px;font-weight:700;font-size:12px;">✓ ${formatarAlocacoes(item)}</span>
      </td>
    </tr>`).join('');

  return `
  <div id="export-orcamento" style="width:1100px;background:#fff;font-family:Arial,Helvetica,sans-serif;padding:36px;color:#1c1c1c;">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #eee;padding-bottom:20px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="font-weight:800;font-size:20px;color:${cor};">${SESSAO.marca === 'Renault' ? 'RENAULT' : 'CHEVROLET'}</div>
        <div style="width:2px;height:40px;background:#ddd;"></div>
        <div style="font-weight:800;font-size:18px;letter-spacing:1px;">GRUPO JORLAN</div>
      </div>
      <div style="font-weight:800;font-size:26px;">ORÇAMENTO DE PEÇAS</div>
      <div style="text-align:right;">
        <div style="font-weight:800;font-size:15px;">${orc.vendedorNome}</div>
        <div style="font-size:12px;color:#777;">${SESSAO.usuario.perfil === 'gestor' ? 'Gestor' : 'Vendedor'}</div>
        <div style="font-size:12px;color:#777;">${orc.vendedorTelefone || ''}</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0;">
      <div style="display:flex;gap:10px;background:#FBF3DC;border-left:4px solid ${cor};padding:12px 16px;border-radius:8px;font-size:12.5px;color:#5c4813;max-width:700px;">
        Orçamento válido por 7 dias. Os valores podem sofrer alteração a qualquer momento, devido à variação de custo e disponibilidade no mercado. A confirmação de disponibilidade e preço será feita no momento da aprovação do pedido.
      </div>
      <div style="background:#161616;color:${cor};padding:10px 18px;border-radius:10px;font-weight:800;text-align:center;">
        <div style="font-size:10px;color:#aaa;">DATA</div>
        <div style="font-size:15px;">${hoje}</div>
      </div>
    </div>

    <div style="font-size:12.5px;color:#555;margin-bottom:10px;">Cliente: <strong>${orc.cliente.nome || '—'}</strong> ${orc.cliente.telefone ? ' · ' + orc.cliente.telefone : ''}</div>

    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#161616;color:#fff;">
          <th style="padding:12px;text-align:left;font-size:12px;">CÓDIGO</th>
          <th style="padding:12px;text-align:left;font-size:12px;">DESCRIÇÃO</th>
          <th style="padding:12px;text-align:center;font-size:12px;">QTDE</th>
          <th style="padding:12px;text-align:right;font-size:12px;">PREÇO</th>
          <th style="padding:12px;text-align:center;font-size:12px;">DISPONIBILIDADE</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:20px;border-top:1px solid #eee;padding-top:18px;">
      <div style="font-weight:700;font-size:16px;">TOTAL</div>
      <div style="font-weight:800;font-size:30px;color:${cor === '#FDB913' ? '#a9860f' : '#a9860f'};">${fmtMoeda(total)}</div>
    </div>
  </div>`;
}

function _prepararContainerExportacao(orc){
  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-9999px';
  wrap.style.top = '0';
  wrap.innerHTML = montarHtmlExportacao(orc);
  document.body.appendChild(wrap);
  return wrap;
}
function gerarPDF(){
  const orc = garantirOrcamentoEmEdicao();
  if(!orc.itens.length){ toast('Adicione itens antes de exportar', 'erro'); return; }
  const wrap = _prepararContainerExportacao(orc);
  const el = wrap.querySelector('#export-orcamento');
  html2canvas(el, { scale: 2 }).then(canvas => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'landscape', unit:'pt', format:[canvas.width/2, canvas.height/2] });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width/2, canvas.height/2);
    pdf.save(`orcamento_${SESSAO.marca}_${(orc.cliente.nome||'cliente').replace(/\s+/g,'_')}.pdf`);
    wrap.remove();
  });
}
function gerarPNG(){
  const orc = garantirOrcamentoEmEdicao();
  if(!orc.itens.length){ toast('Adicione itens antes de exportar', 'erro'); return; }
  const wrap = _prepararContainerExportacao(orc);
  const el = wrap.querySelector('#export-orcamento');
  html2canvas(el, { scale: 2 }).then(canvas => {
    const link = document.createElement('a');
    link.download = `orcamento_${SESSAO.marca}_${(orc.cliente.nome||'cliente').replace(/\s+/g,'_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    wrap.remove();
  });
}
