# Vendas D12
Aplicativo web instalável (PWA), feito principalmente para uso no celular Android.

## Funciona offline
Depois da primeira abertura com internet, o aplicativo fica salvo no aparelho e pode abrir e registrar clientes, vendas, visitas e notas mesmo sem internet.

Os dados de clientes, vendas e visitas ficam no próprio aparelho (localStorage), por isso continuam disponíveis offline.

### Mapas offline
Os mapas que já foram visualizados ficam em cache e podem reaparecer sem internet. Uma região do mapa que nunca foi aberta antes ainda precisa de internet para baixar seus blocos do OpenStreetMap.

## Rodar no computador
1. Instale Node.js 20+.
2. Abra o terminal dentro da pasta do projeto.
3. Rode `npm install`.
4. Rode `npm run dev`.

## Gerar a versão pronta
1. Rode `npm install`.
2. Rode `npm run build`.
3. A pasta `dist` será criada pronta para publicação.

## Publicar no GitHub Pages
O projeto usa caminhos relativos (`base: './'`), então funciona corretamente dentro do endereço do repositório no GitHub Pages.

Envie todos os arquivos ao repositório e publique a pasta `dist`, ou use uma GitHub Action para fazer o build do Vite.

## Instalar no celular
1. Abra o endereço publicado no Chrome do Android com internet pelo menos uma vez.
2. Toque em “Instalar aplicativo” ou “Adicionar à tela inicial”.
3. Depois disso, o Vendas D12 poderá abrir e registrar dados mesmo sem internet.

## Backup
Como os dados ficam salvos no aparelho, não limpe os dados do navegador sem antes fazer backup. Uma próxima versão pode incluir exportação/importação e backup em nuvem.
