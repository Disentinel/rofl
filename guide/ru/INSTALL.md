# Установка блокнота ROFL

Нужны Node 22 или новее (`node -v`) для командной строки и VS Code 1.101 или
новее для редактора. Языковая модель нужна только для перевода ячеек на
естественном языке: встроенная в VS Code (например, Copilot) или консольная,
такая как `claude` ([Модели](MODELS.md)).

    npm install -g @grafema/rofl            # rofl, rofl-nb и языковой сервер rofl-lsp
    npm install -g @grafema/rofl@latest     # позже: новейший выпуск поверх установленного
    code --install-extension ./rofl-*.vsix  # блокнот в VS Code, из .vsix выпуска; --force заменяет ту же версию

До версии 1.4.0 командная строка поставлялась как `rofl-nb-<version>.tgz` из
выпуска на GitHub; `@grafema/rofl` заменяет его теми же двумя командами.
Сначала удалите старый пакет (`npm uninstall -g rofl-nb`), поскольку оба
ставят `rofl-nb` и `rofl-lsp`.

Удаление:

    npm uninstall -g @grafema/rofl
    code --uninstall-extension GrafemaLabs.rofl

Впервые здесь? Идите в [QUICKSTART.md](QUICKSTART.md).
