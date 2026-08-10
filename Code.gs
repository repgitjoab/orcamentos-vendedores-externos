/**
 * GRUPO JORLAN — Backend de referência (Google Apps Script) para conectar
 * a ferramenta de orçamentos a uma Planilha Google real.
 *
 * COMO USAR:
 * 1. Crie uma Google Planilha com as abas: Usuarios, Orcamentos, Rotas,
 *    Parametros, Produtos_Renault, Produtos_GM (estrutura de colunas
 *    espelhando os objetos usados no app.js / telas.js).
 * 2. Abra Extensões > Apps Script na planilha e cole este arquivo.
 * 3. Publique como "Aplicativo da Web" (Implantar > Nova implantação),
 *    executar como "Eu", acesso "Qualquer pessoa com o link".
 * 4. Troque, no front-end (app.js), as funções getDB()/setDB() por
 *    chamadas fetch() para a URL desse Web App (doGet/doPost abaixo).
 *
 * Este arquivo é um PONTO DE PARTIDA — ainda não está conectado ao
 * index.html. A versão atual do app funciona 100% com localStorage,
 * que já reflete essa mesma estrutura de dados.
 */

const SHEET_ID = 'COLOQUE_AQUI_O_ID_DA_PLANILHA';

function doGet(e){
  const acao = e.parameter.acao;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if(acao === 'usuarios') return jsonResponse(lerAba(ss, 'Usuarios'));
  if(acao === 'orcamentos') return jsonResponse(lerAba(ss, 'Orcamentos'));
  if(acao === 'rotas') return jsonResponse(lerAba(ss, 'Rotas'));
  if(acao === 'parametros') return jsonResponse(lerAba(ss, 'Parametros'));
  if(acao === 'produtos') {
    const marca = e.parameter.marca === 'GM' ? 'Produtos_GM' : 'Produtos_Renault';
    return jsonResponse(lerAba(ss, marca));
  }
  return jsonResponse({ erro: 'ação desconhecida' });
}

function doPost(e){
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  // body.acao: 'salvarOrcamento' | 'salvarUsuario' | 'salvarRota' | 'salvarParametros'
  // Implementar gravação linha a linha na aba correspondente, usando o
  // id do registro para localizar/atualizar ou apendar novo.
  return jsonResponse({ ok: true });
}

function lerAba(ss, nomeAba){
  const sheet = ss.getSheetByName(nomeAba);
  if(!sheet) return [];
  const valores = sheet.getDataRange().getValues();
  const cabecalho = valores.shift();
  return valores.map(linha => {
    const obj = {};
    cabecalho.forEach((col, i) => obj[col] = linha[i]);
    return obj;
  });
}

function jsonResponse(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
