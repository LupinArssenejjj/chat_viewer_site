# Chat TXT Viewer

Site para visualizar um TXT de conversa com interface limpa, busca por mensagem e filtro por usuário com autocomplete.

## Como rodar

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

pip install -r requirements.txt

python import_chat.py "CAMINHO_DO_ARQUIVO.txt"
uvicorn app:app --reload
```

Abra no navegador:

```bash
http://127.0.0.1:8000
```

## O que ele faz

- Mostra o começo da conversa primeiro
- Abre filtros pela lupa
- Permite filtrar por usuário
- Se o campo de usuário estiver vazio, lista os usuários
- Conforme você digita, a lista afunila
- Permite buscar por texto de mensagem
- Pagina os resultados para não travar o navegador

## Estrutura

- `import_chat.py`: lê o TXT e grava em SQLite
- `app.py`: backend FastAPI
- `static/index.html`: layout do site
- `static/styles.css`: visual
- `static/app.js`: interação e consumo da API
