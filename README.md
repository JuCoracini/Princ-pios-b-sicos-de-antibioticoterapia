# E-book HTML5 (paginado) — Template

## Rodando localmente
Por ser um e-book que carrega páginas via `fetch()`, use um servidor local (recomendado) para testar:
- VS Code: extensão **Live Server**
- ou `python -m http.server`

## Publicação no GitHub Pages
1. Settings → Pages
2. Source: branch `main` / folder `/root`
3. Acesse a URL do Pages.

## Offline
O modo offline funciona **após o primeiro acesso online**, quando o Service Worker cacheia os arquivos.
