import { CATEGORIES, CATEGORY_LABELS, CONSTANTS, UNIT_LABELS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { DishStore } from '../stores/DishStore.js';
import { Renderer } from '../ui/Renderer.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';
import { exportRecipesAsJson, exportRecipesAsTxt, importRecipesOnly } from './ExportImport.js';

// ---------- Состояние фильтров таба «Рецепты» ----------
let recipesSearchQuery = '';
let recipesCategoryFilter = 'all';

// ---------- Контекст открытия таба ----------
let openedFromChoice = false;

// ---------- Состояние свёрнутых категорий ----------
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
    // Если localStorage недоступен — молча игнорируем.
  }
}

// ---------- Заголовок таба со счётчиком ----------
function updateRecipesTitle(total, found, isFiltered) {
  const title = document.getElementById(CONSTANTS.SELECTORS.recipesTitle);
  if (!title) return;
  if (isFiltered) {
    title.textContent = `📖 Мои рецепты (${found} из ${total})`;
  } else {
    title.textContent = `📖 Мои рецепты (${total})`;
  }
}

function updateBackBtnVisibility() {
  const backBtn = document.getElementById(CONSTANTS.SELECTORS.recipesBackBtn);
  if (backBtn) backBtn.hidden = !openedFromChoice;
}

export function openRecipesTab(fromChoice = false) {
  if (fromChoice) openedFromChoice = true;
  updateBackBtnVisibility();
}

export function resetOpenedFromChoice() {
  openedFromChoice = false;
  updateBackBtnVisibility();
}

// ============================================================
// ОТРИСОВКА СПИСКА РЕЦЕПТОВ
// ============================================================
export function renderRecipesList() {
  const list = document.getElementById(CONSTANTS.SELECTORS.recipesList);
  if (!list) return;
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

  const forceExpand = isFiltered;

  sortedCategories.forEach(cat => {
    const items = grouped[cat];
    const isCollapsed = !forceExpand && collapsedCategories[cat] === true;

    const section = document.createElement('div');
    section.className = 'recipe-category-section';
    if (isCollapsed) section.classList.add('collapsed');

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

// ============================================================
// ФОРМА РЕЦЕПТА — ЛОГИКА (v6.3, схема v2)
// ============================================================

// Создаёт одну строку ингредиента: [название] [количество] [единица] [✕].
function createIngredientRow(ing = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'ingredient-name';
  nameInput.placeholder = 'Название';
  nameInput.value = ing.name || '';
  nameInput.setAttribute('aria-label', 'Название ингредиента');
  row.appendChild(nameInput);

  const amountInput = document.createElement('input');
  amountInput.type = 'text';
  amountInput.inputMode = 'decimal';
  amountInput.className = 'ingredient-amount';
  amountInput.placeholder = 'Кол-во';
  amountInput.value = (ing.amount != null) ? String(ing.amount).replace('.', ',') : '';
  amountInput.setAttribute('aria-label', 'Количество');
  row.appendChild(amountInput);

  const unitSelect = document.createElement('select');
  unitSelect.className = 'ingredient-unit';
  unitSelect.setAttribute('aria-label', 'Единица измерения');
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '—';
  unitSelect.appendChild(emptyOpt);
  Object.entries(UNIT_LABELS).forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    unitSelect.appendChild(opt);
  });
  unitSelect.value = ing.unit || '';
  row.appendChild(unitSelect);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ingredient-remove';
  removeBtn.textContent = '✕';
  removeBtn.setAttribute('aria-label', 'Удалить ингредиент');
  removeBtn.addEventListener('click', function() {
    row.remove();
    // Если строк не осталось — добавляем одну пустую.
    const container = document.getElementById(CONSTANTS.SELECTORS.recipeIngredientsList);
    if (container && container.querySelectorAll('.ingredient-row').length === 0) {
      container.appendChild(createIngredientRow());
    }
  });
  row.appendChild(removeBtn);

  return row;
}

// Перерисовывает список ингредиентов в форме.
function renderIngredientRows(ingredients) {
  const container = document.getElementById(CONSTANTS.SELECTORS.recipeIngredientsList);
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    container.appendChild(createIngredientRow());
    return;
  }
  ingredients.forEach(ing => {
    container.appendChild(createIngredientRow(ing));
  });
}

// Собирает ингредиенты из строк формы в массив объектов.
function collectIngredientRows() {
  const container = document.getElementById(CONSTANTS.SELECTORS.recipeIngredientsList);
  if (!container) return [];
  const rows = container.querySelectorAll('.ingredient-row');
  const result = [];
  rows.forEach(row => {
    const name = row.querySelector('.ingredient-name').value.trim();
    if (!name) return;
    const amountRaw = row.querySelector('.ingredient-amount').value.trim();
    let amount = null;
    if (amountRaw) {
      const parsed = parseFloat(amountRaw.replace(',', '.').replace(/\s/g, ''));
      if (isFinite(parsed) && parsed >= 0) amount = parsed;
    }
    const unit = row.querySelector('.ingredient-unit').value || null;
    result.push({ name, amount, unit });
  });
  return result;
}

// Хелпер: парсит число из поля формы. Пустое или мусор → null.
function parseNumField(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return (isFinite(n) && n >= 0) ? n : null;
}

// ---------- Открытие / закрытие формы ----------
function openRecipeForm(recipeId = null) {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeFormOverlay);
  if (!overlay) return;

  const isEdit = !!recipeId;
  const recipe = isEdit ? RecipeStore.getById(recipeId) : null;
  if (isEdit && !recipe) { showMessage('Рецепт не найден', 'error'); return; }

  const idField       = document.getElementById(CONSTANTS.SELECTORS.recipeFormId);
  const nameInput     = document.getElementById(CONSTANTS.SELECTORS.recipeName);
  const categorySel   = document.getElementById(CONSTANTS.SELECTORS.recipeCategory);
  const cuisineSel    = document.getElementById(CONSTANTS.SELECTORS.recipeCuisine);
  const servingsInput = document.getElementById(CONSTANTS.SELECTORS.recipeServings);
  const cookTimeInput = document.getElementById(CONSTANTS.SELECTORS.recipeCookTime);
  const activeInput   = document.getElementById(CONSTANTS.SELECTORS.recipeActiveTime);
  const diffSel       = document.getElementById(CONSTANTS.SELECTORS.recipeDifficulty);
  const spiceSel      = document.getElementById(CONSTANTS.SELECTORS.recipeSpiciness);
  const instrInput    = document.getElementById(CONSTANTS.SELECTORS.recipeInstructions);
  const mtGroup       = document.getElementById(CONSTANTS.SELECTORS.recipeMealTypesGroup);
  const alGroup       = document.getElementById(CONSTANTS.SELECTORS.recipeAllergensGroup);
  const kcalInput     = document.getElementById(CONSTANTS.SELECTORS.recipeNutritionKcal);
  const proteinInput  = document.getElementById(CONSTANTS.SELECTORS.recipeNutritionProtein);
  const fatInput      = document.getElementById(CONSTANTS.SELECTORS.recipeNutritionFat);
  const carbsInput    = document.getElementById(CONSTANTS.SELECTORS.recipeNutritionCarbs);

  if (isEdit) {
    idField.value = recipe.id;
    nameInput.value = recipe.name || '';
    categorySel.value = recipe.category || CATEGORIES.OTHER;
    cuisineSel.value = recipe.cuisine || '';
    servingsInput.value = (typeof recipe.servings === 'number' && recipe.servings > 0) ? recipe.servings : 1;
    cookTimeInput.value = (recipe.cookTime != null) ? recipe.cookTime : '';
    activeInput.value = (recipe.activeTime != null) ? recipe.activeTime : '';
    diffSel.value = (recipe.difficulty != null) ? String(recipe.difficulty) : '';
    spiceSel.value = (recipe.spiciness != null) ? String(recipe.spiciness) : '';
    instrInput.value = recipe.instructions || '';

    const n = recipe.nutrition || {};
    kcalInput.value = (n.kcal != null) ? n.kcal : '';
    proteinInput.value = (n.protein != null) ? n.protein : '';
    fatInput.value = (n.fat != null) ? n.fat : '';
    carbsInput.value = (n.carbs != null) ? n.carbs : '';

    const types = Array.isArray(recipe.mealTypes) ? recipe.mealTypes : [];
    mtGroup.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = types.includes(cb.dataset.mealType);
    });

    const allergens = Array.isArray(recipe.allergens) ? recipe.allergens : [];
    alGroup.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = allergens.includes(cb.dataset.allergen);
    });

    renderIngredientRows(recipe.ingredients || []);

    document.getElementById(CONSTANTS.SELECTORS.recipeFormTitle).textContent = '✎ Редактировать рецепт';
  } else {
    idField.value = '';
    nameInput.value = '';
    categorySel.value = CATEGORIES.OTHER;
    cuisineSel.value = '';
    servingsInput.value = 1;
    cookTimeInput.value = '';
    activeInput.value = '';
    diffSel.value = '';
    spiceSel.value = '';
    instrInput.value = '';

    kcalInput.value = '';
    proteinInput.value = '';
    fatInput.value = '';
    carbsInput.value = '';

    mtGroup.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
    alGroup.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });

    renderIngredientRows([]);

    document.getElementById(CONSTANTS.SELECTORS.recipeFormTitle).textContent = '📝 Новый рецепт';
  }

  // Всегда сворачиваем «Дополнительно» при открытии.
  const details = overlay.querySelector('.recipe-form-details');
  if (details) details.open = false;

  overlay.classList.add('active');
  trapFocus(overlay, closeRecipeForm);
}

export function closeRecipeForm() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeFormOverlay);
  if (!overlay) return;
  overlay.classList.remove('active');
  if (overlay._trapFocusCleanup) {
    overlay._trapFocusCleanup();
    delete overlay._trapFocusCleanup;
  }
}

// ---------- Сохранение формы ----------
function saveRecipeForm() {
  const id = document.getElementById(CONSTANTS.SELECTORS.recipeFormId).value;
  const name = document.getElementById(CONSTANTS.SELECTORS.recipeName).value.trim();

  if (!name) { showMessage('Введите название рецепта', 'error'); return; }

  const ingredients = collectIngredientRows();
  if (ingredients.length === 0) { showMessage('Добавьте хотя бы один ингредиент', 'error'); return; }

  const category = document.getElementById(CONSTANTS.SELECTORS.recipeCategory).value;
  const cuisine = document.getElementById(CONSTANTS.SELECTORS.recipeCuisine).value || null;

  const servingsRaw = document.getElementById(CONSTANTS.SELECTORS.recipeServings).value;
  const servingsParsed = parseInt(servingsRaw, 10);
  const servings = (isFinite(servingsParsed) && servingsParsed > 0) ? servingsParsed : 1;

  const cookTime = parseNumField(document.getElementById(CONSTANTS.SELECTORS.recipeCookTime).value);
  const activeTime = parseNumField(document.getElementById(CONSTANTS.SELECTORS.recipeActiveTime).value);

  const diffRaw = document.getElementById(CONSTANTS.SELECTORS.recipeDifficulty).value;
  const difficulty = diffRaw ? parseInt(diffRaw, 10) : null;

  const spiceRaw = document.getElementById(CONSTANTS.SELECTORS.recipeSpiciness).value;
  const spiciness = spiceRaw ? parseInt(spiceRaw, 10) : null;

  const instructions = document.getElementById(CONSTANTS.SELECTORS.recipeInstructions).value.trim();

  const nutrition = {
    kcal: parseNumField(document.getElementById(CONSTANTS.SELECTORS.recipeNutritionKcal).value),
    protein: parseNumField(document.getElementById(CONSTANTS.SELECTORS.recipeNutritionProtein).value),
    fat: parseNumField(document.getElementById(CONSTANTS.SELECTORS.recipeNutritionFat).value),
    carbs: parseNumField(document.getElementById(CONSTANTS.SELECTORS.recipeNutritionCarbs).value)
  };

  const mealTypes = [];
  document.querySelectorAll('#recipeMealTypesGroup input[type=checkbox]:checked').forEach(cb => {
    mealTypes.push(cb.dataset.mealType);
  });

  const allergens = [];
  document.querySelectorAll('#recipeAllergensGroup input[type=checkbox]:checked').forEach(cb => {
    allergens.push(cb.dataset.allergen);
  });

  const extra = {
    servings,
    cookTime,
    activeTime,
    difficulty,
    spiciness,
    cuisine,
    allergens,
    mealTypes,
    nutrition
  };

  if (id) {
    RecipeStore.update(Number(id), name, ingredients, instructions, category, extra);
  } else {
    RecipeStore.add(name, ingredients, instructions, category, extra);
  }

  closeRecipeForm();
  renderRecipesList();
}

// ============================================================
// МОДАЛКА ПАРСЕРА ИНГРЕДИЕНТОВ
// ============================================================
function openRecipeParser() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeParserOverlay);
  if (!overlay) return;
  const ta = document.getElementById(CONSTANTS.SELECTORS.recipeParserTextarea);
  if (ta) ta.value = '';
  overlay.classList.add('active');
  trapFocus(overlay, closeRecipeParser);
}

function closeRecipeParser() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipeParserOverlay);
  if (!overlay) return;
  overlay.classList.remove('active');
  if (overlay._trapFocusCleanup) {
    overlay._trapFocusCleanup();
    delete overlay._trapFocusCleanup;
  }
}

function applyRecipeParser() {
  const ta = document.getElementById(CONSTANTS.SELECTORS.recipeParserTextarea);
  const text = ta ? ta.value : '';
  if (!text.trim()) {
    showMessage('Вставь текст ингредиентов', 'error');
    return;
  }

  const result = Utils.parseRecipeText(text);
  if (!Array.isArray(result.ingredients) || result.ingredients.length === 0) {
    showMessage('Не удалось распознать ингредиенты', 'error');
    return;
  }

  const container = document.getElementById(CONSTANTS.SELECTORS.recipeIngredientsList);
  if (!container) { closeRecipeParser(); return; }

  // Убираем пустые строки перед добавлением новых.
  container.querySelectorAll('.ingredient-row').forEach(row => {
    const nameVal = row.querySelector('.ingredient-name').value.trim();
    if (!nameVal) row.remove();
  });

  // Добавляем распознанные строки.
  result.ingredients.forEach(ing => {
    container.appendChild(createIngredientRow(ing));
  });

  // Если поле «Название» пустое и парсер нашёл заголовок — подставляем.
  const nameInput = document.getElementById(CONSTANTS.SELECTORS.recipeName);
  if (result.title && nameInput && !nameInput.value.trim()) {
    nameInput.value = result.title;
    const catSel = document.getElementById(CONSTANTS.SELECTORS.recipeCategory);
    if (catSel) catSel.value = Utils.guessCategory(result.title);
  }

  closeRecipeParser();
  showMessage(`✅ Добавлено ингредиентов: ${result.ingredients.length}`);
}

// ---------- Модалка выбора формата экспорта рецептов ----------
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
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ ТАБА «РЕЦЕПТЫ»
// ============================================================
export function initRecipesHandlers() {
  // Кнопка «← Назад» — видна только при открытии из «Что приготовить?».
  const backBtn = document.getElementById(CONSTANTS.SELECTORS.recipesBackBtn);
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      const wasFromChoice = openedFromChoice;
      openedFromChoice = false;
      updateBackBtnVisibility();
      window.location.hash = 'menu';
      if (wasFromChoice) {
        setTimeout(() => { Renderer.returnToChoice(); }, 0);
      }
    });
  }

  // «➕ Добавить» — открыть пустую форму
  document.getElementById(CONSTANTS.SELECTORS.addRecipeBtn).addEventListener('click', function() {
    openRecipeForm(null);
  });

  // «📤 Экспорт»
  document.getElementById(CONSTANTS.SELECTORS.exportRecipesBtn).addEventListener('click', function() {
    openRecipeExportModal();
  });

  // «📥 Импорт»
  document.getElementById(CONSTANTS.SELECTORS.importRecipesBtn).addEventListener('click', function() {
    document.getElementById(CONSTANTS.SELECTORS.importRecipesFileInput).click();
  });

  document.getElementById(CONSTANTS.SELECTORS.importRecipesFileInput).addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
      importRecipesOnly(this.files[0], () => renderRecipesList());
      this.value = '';
    }
  });

  // Поиск рецептов
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

  // ---- Кнопки формы рецепта ----
  document.getElementById(CONSTANTS.SELECTORS.recipeFormCancel).addEventListener('click', closeRecipeForm);
  document.getElementById(CONSTANTS.SELECTORS.recipeFormSave).addEventListener('click', saveRecipeForm);

  // «+ Добавить ингредиент» — добавляет пустую строку в конец таблицы.
  document.getElementById(CONSTANTS.SELECTORS.recipeAddIngredientBtn).addEventListener('click', function() {
    const container = document.getElementById(CONSTANTS.SELECTORS.recipeIngredientsList);
    if (!container) return;
    container.appendChild(createIngredientRow());
    // Фокус — на новую строку, в поле названия.
    const rows = container.querySelectorAll('.ingredient-row');
    const last = rows[rows.length - 1];
    if (last) {
      const nameField = last.querySelector('.ingredient-name');
      if (nameField) setTimeout(() => nameField.focus(), 0);
    }
  });

  // «🔍 Парсить из текста» — открывает модалку парсера.
  document.getElementById(CONSTANTS.SELECTORS.recipeParseBtn).addEventListener('click', openRecipeParser);

  // ---- Модалка парсера ----
  const parserOverlay = document.getElementById(CONSTANTS.SELECTORS.recipeParserOverlay);
  if (parserOverlay) {
    document.getElementById(CONSTANTS.SELECTORS.recipeParserClose).addEventListener('click', closeRecipeParser);
    document.getElementById(CONSTANTS.SELECTORS.recipeParserCancel).addEventListener('click', closeRecipeParser);
    document.getElementById(CONSTANTS.SELECTORS.recipeParserApply).addEventListener('click', applyRecipeParser);
    parserOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeRecipeParser();
    });
  }

  // ---- Модалка выбора формата экспорта рецептов ----
  const exportOverlay = document.getElementById(CONSTANTS.SELECTORS.recipeExportOverlay);
  if (exportOverlay) {
    const closeBtn = document.getElementById(CONSTANTS.SELECTORS.recipeExportClose);
    if (closeBtn) closeBtn.addEventListener('click', closeRecipeExportModal);

    exportOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeRecipeExportModal();
    });

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
