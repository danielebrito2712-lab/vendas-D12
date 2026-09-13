# Vendas D12

Aplicativo de apoio às vendas da D12, preparado para celular e GitHub Pages.

## Recursos desta versão

- Mapa do Paraná por municípios; clique no município para abrir a cidade.
- Mercados com marcador por situação da última venda.
- Cadastro de mercado com localização atual ou coordenadas informadas manualmente.
- Histórico e edição de vendas.
- Controle de visita do dia.
- Ranking dos 10 maiores clientes.
- Identificação de notas fiscais vinculadas às vendas.
- Controle de carga/estoque por viagem e cidade.
- Galeria de até 10 fotos armazenadas no próprio aparelho.
- Instalação como PWA e suporte parcial a uso offline.
- Atalho para WhatsApp e rota no Google Maps.

## Importante sobre o mapa offline

O desenho dos municípios do Paraná é buscado da internet na primeira abertura e depois salvo localmente. Os mapas de ruas já visualizados também podem permanecer em cache. Portanto, faça a primeira abertura com internet antes de depender do modo offline.

## GitHub Pages

Este projeto inclui `.github/workflows/deploy-pages.yml`.

1. Envie todos os arquivos e pastas do projeto para o repositório.
2. No GitHub, abra **Settings > Pages**.
3. Em **Build and deployment > Source**, escolha **GitHub Actions**.
4. Um novo envio para a branch `main` ou `master` executará a publicação.

## Teste local

```bash
npm install
npm run build
npm run dev
```
