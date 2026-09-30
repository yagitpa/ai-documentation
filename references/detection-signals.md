# Признаки профиля

Флаг ставится при наличии хотя бы одного признака. В манифест записывается путь к файлу-доказательству. Перечисленные признаки — типовые, а не исчерпывающие: подходит любое равносильное свидетельство, если его путь указан.

Не сканировать: `node_modules/`, `.git/`, `venv/`, `.venv/`, `env/`, `__pycache__/`, `dist/`, `build/`, `out/`, `target/`, `.next/`, `.cache/`, `coverage/`, `vendor/`, `project-docs/` (кроме шага 0 и режима обновления).

## Тип проекта

Тип не выбирает документы, а меняет содержание шаблонов (например, раздел «Установка» в Setup & Run).

- `code`: есть `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `pom.xml`, `build.gradle`, `*.csproj`, `Cargo.toml`, `composer.json`, `Gemfile`.
- `low_code`: JSON с ключами `nodes` и `connections` (экспорт n8n); blueprint Make (JSON с `flow` и `metadata`); экспорт Zapier; `docker-compose` с образом `n8nio/n8n`; папка `.n8n/`.

Проект может быть одновременно `code` и `low_code`.

## Флаги

- `llm`: зависимости `openai`, `anthropic`, `@anthropic-ai/sdk`, `langchain*`, `llama-index`, `litellm`, `ollama`, `google-generativeai`, `mistralai`. Ноды n8n `@n8n/n8n-nodes-langchain.*`, `n8n-nodes-base.openAi`. Модули OpenAI или Anthropic в Make. Папки и файлы `prompts/`, `*.prompt`, `*.prompt.md`. Строковые системные промпты в коде.
- `own_model`: скрипты обучения (`train*.py`, `Trainer`, `.fit(`), веса `*.pt`, `*.pth`, `*.safetensors`, `*.onnx`, `*.h5`, `*.joblib`. `mlflow`, `wandb` в зависимостях. Задания fine-tuning.
- `own_data`: датасеты `*.csv`, `*.parquet`, `*.jsonl` в `data/` или `datasets/`. Векторные БД (`chromadb`, `pinecone`, `qdrant`, `weaviate`, `pgvector`, `faiss`). Ноды Vector Store в n8n. База знаний для RAG.
- `metrics`: eval-скрипты, `promptfoo`, `deepeval`, `ragas`, конфигурация A/B-тестов, запись метрик в таблицы или БД, ссылки на дашборды.
- `api`: веб-фреймворки (`fastapi`, `flask`, `django`, `express`, `@nestjs/*`, `koa`, `hono`), файлы `openapi.*`, `swagger.*`, ноды Webhook в n8n, объявления роутов.
- `end_users`: фронтенд (`react`, `vue`, `svelte`, `next`, шаблоны HTML), боты (`python-telegram-bot`, `aiogram`, `telegraf`, ноды Telegram, Slack, WhatsApp), n8n Form Trigger, Chat Trigger.
- `deployed`: `Dockerfile`, `docker-compose*`, `.github/workflows/`, `.gitlab-ci.yml`, манифесты Kubernetes, `*.tf`, `vercel.json`, `netlify.toml`, `Procfile`, конфиги по окружениям (`*.prod.*`, `staging`). Также ставится по ответу пользователя, если он описывает несколько окружений или процесс деплоя. Ответ только о месте работы («self-hosted», «n8n Cloud», «через ngrok») флаг не ставит: эти сведения идут в `02-architecture.md` → «Компоненты» и `03-setup-and-run.md` → «Предусловия».
- `external_services`: переменные ключей в `.env.example`, ссылки на credentials в экспорте workflow, SDK внешних SaaS, вызовы HTTP API.
- `product`: в проекте есть ТЗ, PRD, бриф или требования (файлы `*prd*`, `*тз*`, `requirements*.md`, `brief*`), либо пользователь в раунде вопросов дал требования шире, чем цель проекта.
- `team`: в `git log` не меньше двух авторов, или есть `CODEOWNERS`.
- `handoff`: пользователь говорит о передаче проекта, новой команде или сопровождении другими людьми. Если это неясно, в раунде вопросов задаётся вопрос «Документация готовится для передачи другой команде или специалисту?».

## Встроенная документация

Встроенная документация — источник третьего уровня (см. SKILL.md → «Границы»). Она не ставит флаги, но подсказывает, что искать и где.

- Файлы: `README*`, `docs/`, `CONTRIBUTING*`, `CHANGELOG*`, ADR (`adr/`, `decisions/`).
- n8n: ноды `n8n-nodes-base.stickyNote`, текст в `parameters.content`, а также поле `notes` у обычных нод. В n8n-проектах это часто основная документация, и она устаревает быстрее всего.
- Make: заметки в blueprint (`metadata`, `notes` у модулей).
- Код: docstring и комментарии у точек входа и нетривиальных функций.

Правила сверки:
- Утверждение о поведении (какая нода, какой сервис, какое значение, подключено ли что-то) проверяется по нодам или коду до переноса в документ.
- Утверждение о намерении или причине («сделано так из-за бага штатной ноды») переносится со ссылкой на источник, без проверки.
- Найденное расхождение записывается по SKILL.md → «Границы».

## Сомнительные случаи

- Признак найден только в примерах, тестах или архивных папках. Флаг не ставится, наблюдение выносится в вопрос.
- `llm` без `own_model`: модель используется через API. Model Card не создаётся, создаётся Model Usage.
- Датасет-фикстура для тестов не даёт `own_data`.
