import { CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { DishStore } from '../stores/DishStore.js';
import { Renderer } from '../ui/Renderer.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';
import { exportRecipesOnly, importRecipesOnly } from './ExportImport.js';

// ---------- Состояние фильтров модалки «Мои рецепты» ----------
let recipesSearchQuery = '';
let recipesCategoryFilter = 'all';

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

  if (allRecipes.length === 0) {
    list.innerHTML = '<div class="modal-empty">😌 У вас пока нет рецептов. Нажмите «Добавить рецепт».</div>';
    return;
  }

  // Применяем фильтры
  const query = recipesSearchQuery.trim().toLowerCase();
  let recipes = allRecipes;
  if (query) {
    recipes = recipes.filter(r => r.name.toLowerCase().includes(query));
  }
  if (recipesCategoryFilter !== 'all') {
    recipes = recipes.filter(r => (r.category || Utils.guessCategory(r.name)) === recipesCategoryFilter);
  }

  if (recipes.length === 0) {
    list.innerHTML = '<div class="modal-empty">😌 Ничего не найдено. Измените поиск или фильтр.</div>';
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

  sortedCategories.forEach(cat => {
    const section = document.createElement('div');
    section.className = 'recipe-category-section';

    const header = document.createElement('h4');
    header.className = 'recipe-category-header';
    header.textContent = CATEGORY_LABELS[cat] || cat;
    section.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'recipe-list';

    grouped[cat].forEach(recipe => {
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

export function openRecipeForm(recipeId = null) {
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

export function saveRecipeForm() {
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

export function parseRecipeTextFromForm() {
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
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ МОДАЛКИ «МОИ РЕЦЕПТЫ»
// ============================================================
export function initRecipesHandlers() {
  // «➕ Добавить» — открыть пустую форму
  document.getElementById(CONSTANTS.SELECTORS.addRecipeBtn).addEventListener('click', function() {
    openRecipeForm(null);
  });

  // «📤 Экспорт» — скачать JSON-файл с рецептами
  document.getElementById(CONSTANTS.SELECTORS.exportRecipesBtn).addEventListener('click', function() {
    exportRecipesOnly();
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
}
