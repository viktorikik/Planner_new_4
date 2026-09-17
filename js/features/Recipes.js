import { CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { DishStore } from '../stores/DishStore.js';
import { Renderer } from '../ui/Renderer.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';
import { exportRecipesAsJson, exportRecipesAsTxt, importRecipesOnly } from './ExportImport.js';

// ---------- Состояние фильтров модалки «Мои рецепты» ----------
let recipesSearchQuery = '';
let recipesCategoryFilter = 'all';

// ---------- Состояние свёрнутых категорий ----------
// { soup: true, salad: false, ... }
let collapsedCategories = loadCollapsedState();

function loadCollapsedState() {
  try {
    const raw = localStorage.getItem(CONSTANTS.STORAGE_KEYS.RECIPES_COLLAPSED);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveCollapsedState() {
  try {
    localStorage.setItem(CONSTANTS.STORAGE_KEYS.RECIPES_COLLAPSED, JSON.stringify(collapsedCategories));
  } catch (e) {
    // Если localStorage недоступен — молча игнорируем: состояние не сохранится между сессиями,
    // но приложение продолжит работать.
  }
}

// ---------- Счётчик в заголовке модалки ----------
function updateRecipesTitle(total, found, isFiltered) {
  const title = document.getElementById(CONSTANTS.SELECTORS.recipesTitle);
  if (!title) return;
  if (isFiltered) {
    title.textContent = `📖 Мои рецепты (${found} из ${total})`;
  } else {
    title.textContent = `📖 Мои рецепты (${total})`;
  }
}

export function openRecipesModal() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipesOverlay);
  overlay.classList.add('active');
  // Сбрасываем фильтры при каждом открытии
  recipesSearchQuery = '';
  recipesCategoryFilter = 'all';
  const searchInput = document.getElementById(CONSTANTS.SELECTORS.recipesSearchInput);
  const categorySelect = document.getElementById(CONSTANTS.SELECTORS.recipesCategoryFilter);
  if (searchInput) searchInput.value = '';
  if (categorySelect) categorySelect.value = 'all';

  renderRecipesList();
  trapFocus(overlay, closeRecipesModal);
}

export function closeRecipesModal() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipesOverlay);
  overlay.classList.remove('active');
  if (overlay._trapFocusCleanup) {
    overlay._trapFocusCleanup();
    delete overlay._trapFocusCleanup;
  }
}

export function renderRecipesList() {
  const list = document.getElementById(CONSTANTS.SELECTORS.recipesList);
  const allRecipes = RecipeStore.getAll();
  list.innerHTML = '';

  const query = recipesSearchQuery.trim().toLowerCase();
  const isFiltered = query !== '' || recipesCategoryFilter !== 'all';

  let recipes = allRecipes;
  if (query) {
    recipes = recipes.filter(r => r.name.toLowerCase().includes(query));
  }
  if (recipesCategoryFilter !== 'all') {
    recipes = recipes.filter(r => (r.category || Utils.guessCategory(r.name)) === recipesCategoryFilter);
  }

  // Обновляем счётчик в заголовке ДО всех ранних return
  updateRecipesTitle(allRecipes.length, recipes.length, isFiltered);

  if (allRecipes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'modal-empty';
    empty.textContent = '😌 У вас пока нет рецептов. Нажмите «Добавить рецепт».';
    list.appendChild(empty);
    return;
  }

  if (recipes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'modal-empty';
    empty.textContent = '😌 Ничего не найдено. Измените поиск или фильтр.';
    list.appendChild(empty);
    return;
  }

  const grouped = {};
  recipes.forEach(recipe => {
    const cat = recipe.category || Utils.guessCategory(recipe.name);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(recipe);
  });

  const categoryOrder = [CATEGORIES.SOUP, CATEGORIES.SALAD, CATEGORIES.MAIN, CATEGORIES.BAKERY, CATEGORIES.OTHER];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
  });

  // При активном фильтре/поиске разворачиваем всё принудительно,
  // чтобы результаты были видны пользователю.
  const forceExpand = isFiltered;

  sortedCategories.forEach(cat => {
    const items = grouped[cat];
    const isCollapsed = !forceExpand && collapsedCategories[cat] === true;

    const section = document.createElement('div');
    section.className = 'recipe-category-section';
    if (isCollapsed) section.classList.add('collapsed');

    // ----- Заголовок-кнопка -----
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'recipe-category-header';
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.setAttribute('aria-label', `Категория ${CATEGORY_LABELS[cat] || cat}, рецептов: ${items.length}`);

    const arrow = document.createElement('span');
    arrow.className = 'recipe-category-arrow';
    arrow.textContent = '▶';
    arrow.setAttribute('aria-hidden', 'true');
    header.appendChild(arrow);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'recipe-category-title';
    titleSpan.textContent = CATEGORY_LABELS[cat] || cat;
    header.appendChild(titleSpan);

    const countSpan = document.createElement('span');
    countSpan.className = 'recipe-category-count';
    countSpan.textContent = `(${items.length})`;
    header.appendChild(countSpan);

    header.addEventListener('click', function() {
      const nowCollapsed = section.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', String(!nowCollapsed));
      collapsedCategories[cat] = nowCollapsed;
      saveCollapsedState();
    });

    section.appendChild(header);

    // ----- Список рецептов -----
    const ul = document.createElement('ul');
    ul.className = 'recipe-list';

    items.forEach(recipe => {
      const li = document.createElement('li');
      li.className = 'recipe-list-item';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = recipe.name;
      nameSpan.className = 'recipe-name-clickable';
      nameSpan.setAttribute('tabindex', '0');
      nameSpan.setAttribute('role', 'button');
      nameSpan.setAttribute('aria-label', `Открыть рецепт ${recipe.name}`);
      nameSpan.addEventListener('click', () => {
        Renderer.showRecipeCard(recipe);
      });
      nameSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          Renderer.showRecipeCard(recipe);
        }
      });
      li.appendChild(nameSpan);

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.className = 'recipe-edit-btn';
      editBtn.title = 'Редактировать рецепт';
      editBtn.setAttribute('aria-label', `Редактировать рецепт ${recipe.name}`);
      editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openRecipeForm(recipe.id);
      });
      li.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️';
      deleteBtn.className = 'recipe-delete-btn';
      deleteBtn.title = 'Удалить рецепт';
      deleteBtn.setAttribute('aria-label', `Удалить рецепт ${recipe.name}`);
      deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const answer = confirm(
          `Удалить рецепт "${recipe.name}"?\n\n` +
          `Блюда, которые на него ссылаются, потеряют связь с рецептом.`
        );
        if (!answer) return;
        DishStore.clearRecipeRefs(recipe.id);
        RecipeStore.remove(recipe.id);
      });
      li.appendChild(deleteBtn);

      ul.appendChild(li);
    });

    section.appendChild(ul);
    list.appendChild(section);
  });
}

function openRecipeForm(recipeId = null) {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeFormOverlay);
  const formId = document.getElementById(CONSTANTS.SELECTORS.recipeFormId);
  const nameInput = document.getElementById(CONSTANTS.SELECTORS.recipeName);
  const ingrInput = document.getElementById(CONSTANTS.SELECTORS.recipeIngredients);
  const instrInput = document.getElementById(CONSTANTS.SELECTORS.recipeInstructions);
  const categorySelect = document.getElementById(CONSTANTS.SELECTORS.recipeCategory);

  if (recipeId) {
    const recipe = RecipeStore.getById(recipeId);
    if (!recipe) return;
    formId.value = recipeId;
    nameInput.value = recipe.name;
    ingrInput.value = recipe.ingredients.join('\n');
    instrInput.value = recipe.instructions || '';
    categorySelect.value = recipe.category || Utils.guessCategory(recipe.name);
    document.getElementById(CONSTANTS.SELECTORS.recipeFormTitle).textContent = '✎ Редактировать рецепт';
  } else {
    formId.value = '';
    nameInput.value = '';
    ingrInput.value = '';
    instrInput.value = '';
    categorySelect.value = CATEGORIES.OTHER;
    document.getElementById(CONSTANTS.SELECTORS.recipeFormTitle).textContent = '📝 Новый рецепт';
  }
  overlay.classList.add('active');
  trapFocus(overlay, closeRecipeForm);
}

export function closeRecipeForm() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeFormOverlay);
  overlay.classList.remove('active');
  if (overlay._trapFocusCleanup) {
    overlay._trapFocusCleanup();
    delete overlay._trapFocusCleanup;
  }
}

function saveRecipeForm() {
  const id = document.getElementById(CONSTANTS.SELECTORS.recipeFormId).value;
  const name = document.getElementById(CONSTANTS.SELECTORS.recipeName).value.trim();
  const ingredients = document.getElementById(CONSTANTS.SELECTORS.recipeIngredients).value.trim();
  const instructions = document.getElementById(CONSTANTS.SELECTORS.recipeInstructions).value.trim();
  const category = document.getElementById(CONSTANTS.SELECTORS.recipeCategory).value;

  if (!name) { showMessage('Введите название рецепта', 'error'); return; }
  if (!ingredients) { showMessage('Введите ингредиенты', 'error'); return; }

  if (id) {
    RecipeStore.update(Number(id), name, ingredients, instructions, category);
  } else {
    RecipeStore.add(name, ingredients, instructions, category);
  }
  closeRecipeForm();
  renderRecipesList();
}

function parseRecipeTextFromForm() {
  const ingrText = document.getElementById(CONSTANTS.SELECTORS.recipeIngredients).value;
  const result = Utils.parseRecipeText(ingrText);
  if (result.title) {
    document.getElementById(CONSTANTS.SELECTORS.recipeName).value = result.title;
    const cat = Utils.guessCategory(result.title);
    document.getElementById(CONSTANTS.SELECTORS.recipeCategory).value = cat;
  }
  if (result.ingredients) {
    document.getElementById(CONSTANTS.SELECTORS.recipeIngredients).value = result.ingredients;
  } else {
    showMessage('Не удалось распознать ингредиенты. Попробуйте вручную.', 'error');
  }
}

// ============================================================
// МОДАЛКА ВЫБОРА ФОРМАТА ЭКСПОРТА РЕЦЕПТОВ
// ============================================================
function openRecipeExportModal() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeExportOverlay);
  if (!overlay) return;
  overlay.classList.add('active');
  trapFocus(overlay, closeRecipeExportModal);
}

function closeRecipeExportModal() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeExportOverlay);
  if (!overlay) return;
  overlay.classList.remove('active');
  if (overlay._trapFocusCleanup) {
    overlay._trapFocusCleanup();
    delete overlay._trapFocusCleanup;
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ МОДАЛКИ «МОИ РЕЦЕПТЫ»
// ============================================================
export function initRecipesHandlers() {
  // «➕ Добавить» — открыть пустую форму
  document.getElementById(CONSTANTS.SELECTORS.addRecipeBtn).addEventListener('click', function() {
    openRecipeForm(null);
  });

  // «📤 Экспорт» — открыть модалку выбора формата
  document.getElementById(CONSTANTS.SELECTORS.exportRecipesBtn).addEventListener('click', function() {
    openRecipeExportModal();
  });

  // «📥 Импорт» — открыть диалог выбора файла
  document.getElementById(CONSTANTS.SELECTORS.importRecipesBtn).addEventListener('click', function() {
    document.getElementById(CONSTANTS.SELECTORS.importRecipesFileInput).click();
  });

  // Обработчик выбора файла для импорта
  document.getElementById(CONSTANTS.SELECTORS.importRecipesFileInput).addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
      importRecipesOnly(this.files[0], () => renderRecipesList());
      this.value = '';
    }
  });

  // Поиск рецептов (с debounce)
  const searchInput = document.getElementById(CONSTANTS.SELECTORS.recipesSearchInput);
  const debouncedSearch = Utils.debounce(function() {
    recipesSearchQuery = this.value;
    renderRecipesList();
  }, 250);
  searchInput.addEventListener('input', debouncedSearch);

  // Фильтр по категории
  document.getElementById(CONSTANTS.SELECTORS.recipesCategoryFilter).addEventListener('change', function() {
    recipesCategoryFilter = this.value;
    renderRecipesList();
  });

  // Кнопки формы рецепта
  document.getElementById(CONSTANTS.SELECTORS.recipeFormCancel).addEventListener('click', closeRecipeForm);
  document.getElementById(CONSTANTS.SELECTORS.recipeFormSave).addEventListener('click', saveRecipeForm);
  document.getElementById(CONSTANTS.SELECTORS.recipeParseBtn).addEventListener('click', parseRecipeTextFromForm);

  // ---- Модалка выбора формата экспорта рецептов ----
  const exportOverlay = document.getElementById(CONSTANTS.SELECTORS.recipeExportOverlay);
  if (exportOverlay) {
    const closeBtn = document.getElementById(CONSTANTS.SELECTORS.recipeExportClose);
    if (closeBtn) closeBtn.addEventListener('click', closeRecipeExportModal);

    // Клик по затемнённому фону — закрыть
    exportOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeRecipeExportModal();
    });

    // Кнопки формата
    exportOverlay.querySelectorAll(CONSTANTS.SELECTORS.recipeExportOptions).forEach(btn => {
      btn.addEventListener('click', function() {
        const format = this.dataset.format;
        closeRecipeExportModal();
        if (format === 'json') {
          exportRecipesAsJson();
        } else if (format === 'txt') {
          exportRecipesAsTxt();
        }
      });
    });
  }
}
