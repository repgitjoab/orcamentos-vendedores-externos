/* ==========================================================================
   Telas 3 — Rotas de Visita
   ========================================================================== */

RENDERERS['rotas'] = function(){
  const db = getDB();
  const minhasRotas = db.rotas.filter(r => r.marca === SESSAO.marca && r.vendedorId === SESSAO.usuario.id);
  minhasRotas.sort((a,b) => new Date(b.data||0) - new Date(a.data||0));
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar"><button class="btn btn-primary" onclick="abrirModalNovaRota()">+ Nova Rota</button></div>
    ${minhasRotas.length === 0 ? `<div class="empty-state"><h3>Nenhuma rota criada</h3><p>Crie uma rota com os clientes que vai visitar, incluindo o link do Google Maps de cada um.</p></div>` :
      minhasRotas.map(rota => renderCardRota(rota)).join('')}
  `;
};

function renderCardRota(rota){
  const confirmadas = rota.clientes.filter(c => c.status === 'confirmada').length;
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <strong>${rota.nome}</strong>
          <div style="font-size:12.5px;color:var(--gray-500);">${rota.data ? new Date(rota.data).toLocaleDateString('pt-BR') : ''} · ${confirmadas}/${rota.clientes.length} visitas confirmadas</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="abrirModalAddCliente('${rota.id}')">+ Cliente na rota</button>
      </div>
      <table style="width:100%;margin-top:14px;font-size:13px;">
        <thead><tr><th style="text-align:left;">Cliente</th><th style="text-align:left;">Local</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rota.clientes.map((c, idx) => `
            <tr>
              <td>${c.nome}</td>
              <td>${c.mapsLink ? `<a href="${c.mapsLink}" target="_blank" rel="noopener">Abrir no Maps ↗</a>` : '—'}</td>
              <td>
                ${c.status === 'confirmada'
                  ? `<span class="badge badge-verde">Visitado — ${fmtData(c.horaConfirmacao)}</span>`
                  : `<span class="badge badge-cinza">Planejada</span>`}
              </td>
              <td>
                ${c.status !== 'confirmada' ? `<button class="btn btn-gold btn-sm" onclick="confirmarVisita('${rota.id}',${idx})">Confirmar chegada</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function abrirModalNovaRota(){
  abrirModal(`
    <button class="modal-close" onclick="fecharModal()">&times;</button>
    <h3>Nova rota de visitas</h3>
    <div class="campo"><label>Nome da rota</label><input type="text" id="rota-nome" placeholder="Ex: Rota Região Norte - Segunda"></div>
    <div class="campo"><label>Data</label><input type="date" id="rota-data" value="${new Date().toISOString().slice(0,10)}"></div>
    <button class="btn btn-primary btn-block" onclick="salvarNovaRota()">Criar rota</button>
  `);
}
function salvarNovaRota(){
  const nome = document.getElementById('rota-nome').value.trim();
  const data = document.getElementById('rota-data').value;
  if(!nome){ toast('Informe o nome da rota', 'erro'); return; }
  const db = getDB();
  const novaRota = { id: novoId(), marca: SESSAO.marca, vendedorId: SESSAO.usuario.id, nome, data, clientes: [] };
  db.rotas.push(novaRota);
  setDB(db);
  sincronizarRegistro('Rotas', novaRota);
  fecharModal();
  toast('Rota criada', 'sucesso');
  recarregarTela();
}
function abrirModalAddCliente(rotaId){
  abrirModal(`
    <button class="modal-close" onclick="fecharModal()">&times;</button>
    <h3>Adicionar cliente à rota</h3>
    <div class="campo"><label>Nome do cliente</label><input type="text" id="rc-nome"></div>
    <div class="campo"><label>Link do Google Maps</label><input type="text" id="rc-maps" placeholder="https://maps.google.com/..."></div>
    <button class="btn btn-primary btn-block" onclick="salvarClienteNaRota('${rotaId}')">Adicionar</button>
  `);
}
function salvarClienteNaRota(rotaId){
  const nome = document.getElementById('rc-nome').value.trim();
  const mapsLink = document.getElementById('rc-maps').value.trim();
  if(!nome){ toast('Informe o nome do cliente', 'erro'); return; }
  const db = getDB();
  const rota = db.rotas.find(r => r.id === rotaId);
  rota.clientes.push({ nome, mapsLink, status:'planejada', horaConfirmacao:null });
  setDB(db);
  sincronizarRegistro('Rotas', rota);
  fecharModal();
  toast('Cliente adicionado à rota', 'sucesso');
  recarregarTela();
}
function confirmarVisita(rotaId, idx){
  const db = getDB();
  const rota = db.rotas.find(r => r.id === rotaId);
  rota.clientes[idx].status = 'confirmada';
  rota.clientes[idx].horaConfirmacao = new Date().toISOString();
  sincronizarRegistro('Rotas', rota);
  setDB(db);
  toast('Visita confirmada', 'sucesso');
  recarregarTela();
}
