# Ferramenta de Orçamentos — Vendedores Externos (Grupo Jorlan)

Primeira versão funcional da ferramenta, pronta para testar. Hoje ela roda **100% no navegador**, guardando os dados no `localStorage` (funciona offline, em PC, tablet ou celular, sem precisar de servidor). O próximo passo é plugar essa mesma estrutura no Google Sheets (arquivo `Code.gs` incluso como ponto de partida).

## Como abrir
Abra o arquivo `index.html` (dois cliques, ou publique a pasta inteira no GitHub Pages, igual às outras ferramentas). Todos os arquivos (`app.js`, `telas.js`, `telas2.js`, `telas3.js`, `produtos_renault.js`, `produtos_gm.js`) precisam estar na mesma pasta.

## Logins de teste (já vêm cadastrados)

| Marca | Perfil | Login | Senha |
|---|---|---|---|
| Renault | Gestor | `gestor.renault` | `1234` |
| Renault | Vendedor | `vendedor.renault` | `1234` |
| Renault | Faturamento | `faturamento.renault` | `1234` |
| GM | Gestor | `gestor.gm` | `1234` |
| GM | Vendedor | `vendedor.gm` | `1234` |
| GM | Faturamento | `faturamento.gm` | `1234` |

O Gestor pode criar/editar outros acessos em **Cadastro de Vendedores** — troque essas senhas de teste antes de usar em produção.

## O que já está funcionando
- Seleção de marca (Renault / GM) antes do login
- Login separado por marca, inclusive gestores
- Consulta de produtos (base real da planilha Renault que você enviou — 6.621 itens; a base GM está vazia até você enviar a lista)
- Montagem de orçamento: adicionar itens, definir ICMS por item, definir preço de venda OU margem desejada (calcula automaticamente pela fórmula Margem = Preço de Venda − ICMS − Custo Contábil)
- Exportação do orçamento em PDF e PNG, no layout baseado no modelo que você enviou
- Fluxo de status: rascunho → (se margem baixa) aguardando aprovação da gestão → pendente com cliente → aprovado (enviado ao faturamento) → faturado (com número da NF)
- Edição do orçamento mesmo depois de aprovado, enquanto não for faturado — gera aviso para o faturamento
- Tela de Faturamento: lista de aprovados, input do número da NF
- Tela de Gestão: todos os orçamentos da marca, aprovações de margem pendentes, cadastro de vendedores, parametrização da margem mínima por marca
- Rotas de visita: criar rota, adicionar clientes com link do Google Maps, confirmar chegada

## O que falta para ficar 100% pronto para produção
1. **Base de produtos GM** — me envie a planilha equivalente à Renault que eu converto igual fiz com essa
2. **Logos** — coloque `logo-renault.png` e `logo-gm.png` na pasta `assets/` (sem eles, o sistema mostra o nome da marca em texto)
3. **Conectar ao Google Sheets de verdade** — hoje os dados ficam no navegador (localStorage), que é ótimo para testar mas não sincroniza entre aparelhos/vendedores. O arquivo `Code.gs` é o ponto de partida do backend; o próximo passo é publicar essa planilha como Web App e trocar as funções `getDB()`/`setDB()` do `app.js` por chamadas para essa API
4. Ideias da lista original (WhatsApp, PWA offline, geolocalização automática, dashboard de desempenho, metas) ainda não entraram — dá pra priorizar depois que você validar o fluxo principal

## Teste sugerido
1. Login como `vendedor.renault`
2. Consultar Produtos → adicionar 2-3 itens
3. Ir em Novo Orçamento → preencher cliente, ajustar ICMS/margem de um item para forçar ele ficar abaixo do mínimo (10% por padrão)
4. Salvar → deve ir para "Aguardando aprovação de margem"
5. Sair, entrar como `gestor.renault` → Aprovações de Margem → aprovar
6. Voltar como vendedor → orçamento aparece "Pendente" → gerar PDF → Marcar como Aprovado
7. Entrar como `faturamento.renault` → Orçamentos Aprovados → Faturar (informar NF)
8. Voltar como vendedor/gestor → conferir que a NF aparece
