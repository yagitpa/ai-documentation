# Служебные файлы

## README.md

Карта папки. Шапка документа не нужна.

```markdown
# Документация проекта <название>

<Назначение проекта одной фразой.> Обновлено: YYYY-MM-DD. Открытых вопросов: N (важных: M) — см. [open-questions.md](open-questions.md).

## С чего начать
- Новый участник: 01-overview → 02-architecture → 03-setup-and-run
- Сопровождение: 03-setup-and-run → 06-troubleshooting → 04-configuration
- <другие роли по составу набора>

## Документы
| Файл | О чём | Для кого |
|---|---|---|

## Как обновлять
Документация генерируется скиллом ai-documentation. После изменений в проекте — `/ai-documentation обновить`, после ответов в [open-questions.md](open-questions.md) — `/ai-documentation ответы`. Ручной текст, который не должен перезаписываться, заключайте в `<!-- manual -->` … `<!-- /manual -->`.
```

## manifest.yaml

```yaml
version: 1
generated_at: 2026-09-30T10:15:00.000Z
updated_at: 2026-09-30T14:42:07.000Z   # время последнего запуска, из системы
git_commit: null            # хэш HEAD на момент обновления, null без git
project_type: [low_code]    # code / low_code
profile:
  llm:
    value: true
    evidence: [workflows/assistant.json]
  handoff:
    value: true
    evidence: [Q-002]
documents:
  - file: 11-workflow.md
    reason: low_code
    sources: [workflows/assistant.json]
    sha256: 3f9a…            # вывод check-docs.js --hashes
questions:
  next_id: 8
```

В `profile` записываются только выставленные флаги. Доказательством может быть путь или ID ответа.

`sources` — пути к файлам или папкам проекта, из которых собран документ. Папка означает «любой файл внутри». По этому полю режим обновления решает, какие документы пересобирать, поэтому указываются реальные источники, а не весь проект.

`sha256` — хэш документа после последнего запуска скилла. Не совпадает с текущим — документ правили вручную.

## open-questions.md

Формат описан в `references/questions-protocol.md`. Если вопросов нет, файл всё равно создаётся, с пустыми разделами «Открытые» и «Закрытые» и строкой «Открытых вопросов нет».

## CHANGELOG.md

Новые записи добавляются сверху. На каждый запуск скилла одна запись. Дата записи — дата из `updated_at` манифеста этого запуска.

```markdown
# Журнал изменений документации

## 2026-09-30 · обновление
- Изменено: 11-workflow.md (новая нода «Классификатор»), 04-configuration.md
- Применены ответы: Q-003, Q-005
- Новые вопросы: Q-008
- Причина: изменения в workflows/assistant.json
```
