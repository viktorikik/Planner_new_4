/* ============================================================
   ПАНЕЛЬ КНОПОК В МОДАЛКЕ «МОИ РЕЦЕПТЫ»
   ============================================================ */
.recipes-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.recipes-toolbar button {
  flex: 1 1 0;
  min-width: 110px;
  padding: 8px 14px;
  border-radius: var(--radius-lg);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-fast);
  appearance: none;
}

/* Стили для каждой кнопки берутся из уже существующих классов .btn-done и .btn-secondary,
   но если их глобальных правил не хватает — раскомментируйте нужное: */

.recipes-toolbar .btn-done {
  background: var(--accent-color);
  color: var(--accent-text);
  border: none;
}
.recipes-toolbar .btn-done:hover {
  filter: brightness(1.05);
  transform: translateY(-2px);
}

.recipes-toolbar .btn-secondary {
  background: transparent;
  border: 1.5px solid var(--text-muted);
  color: var(--text-primary);
}
.recipes-toolbar .btn-secondary:hover {
  background: var(--cell-bg);
  border-color: var(--text-primary);
  transform: translateY(-2px);
}

/* На узких экранах — кнопки вертикально */
@media (max-width: 480px) {
  .recipes-toolbar button {
    flex: 1 1 100%;
    min-width: 0;
  }
}
