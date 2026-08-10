// Base de produtos da marca GM (Chevrolet).
// Ainda não recebemos a planilha de itens GM — assim que Joabe enviar,
// convertemos no mesmo formato usado em produtos_renault.js e substituímos
// este arquivo. Estrutura esperada de cada item (agrupado por código,
// com uma loja por empresa que possui o produto):
// {
//   codigo, descricao, curva, possuiPis, possuiCofins,
//   lojas: [ { empresa, custoContabil, precoVendaIC, precoVendaFor, locacao } ]
// }
const PRODUTOS_GM = [];
