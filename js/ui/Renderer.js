import { STATUSES, CATEGORIES, MEAL_TYPES, MEAL_TYPE_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';
import { RecommendationEngine } from '../features/RecommendationEngine.js';

export const Renderer = (function() {
  let currentView = 'week';
  let currentDate = new Date();
  let searchQuery = '', statusFilter = 'all', categoryFilter = 'all';
  let currentModalDate = null;

  let touchDragActive = false;
  let openSwipeCard = null;
  let activeUndoSnackbar = null;

  let choiceFilterMealType = '';
  let choiceFilterCategory = 'all';
  let choiceFilterOnlyFavorites = false;
  let choiceOffset = 0;
  // Кэш отсортированного движком списка для экрана «Что приготовить?».
  // Хранится между рендерами, чтобы «🎲 Другое» сдвигало окно по одному
  // и тому же порядку, а не пересчитывало score заново (в score есть
  // небольшой random jitter — без кэша порядок бы «прыгал»).
  // Сбрасывается при смене фильтров и при изменении данных.
  let choiceRankedCache = null;

  const els = {};
  for (const key in CONSTANTS.SELECTORS) {
    if (typeof CONSTANTS.SELECTORS[key] === 'string' && !CONSTANTS.SELECTORS[key].startsWith('#')) {
      els[key] = document.getElementById(CONSTANTS.SELECTORS[key]);
    }
  }

  const monthTitle = els.monthTitle;
  const calendarContent = els.calendarContent;
  const menuContent = els.menuContent;
  const menuPeriod = els.menuPeriod;
  const modalOverlay = els.modalOverlay;
  const modalDate = els.modalTitle;
  const modalContent = els.modalContent;

  const CATEGORY_OPTIONS = [
    { val: CATEGORIES.SOUP,   label: '🍲 Суп' },
    { val: CATEGORIES.SALAD,  label: '🥗 Салат' },
    { val: CATEGORIES.MAIN,   label: '🍖 Основное' },
    { val: CATEGORIES.BAKERY, label: '🥐 Выпечка' },
    { val: CATEGORIES.OTHER,  label: '🍽️ Другое' }
  ];

  const MEAL_TYPE_OPTIONS = [
    { val: MEAL_TYPES.BREAKFAST, label: MEAL_TYPE_LABELS[MEAL_TYPES.BREAKFAST] },
    { val: MEAL_TYPES.LUNCH,     label: MEAL_TYPE_LABELS[MEAL_TYPES.LUNCH] },
    { val: MEAL_TYPES.DINNER,    label: MEAL_TYPE_LABELS[MEAL_TYPES.DINNER] },
    { val: MEAL_TYPES.SNACK,     label: MEAL_TYPE_LABELS[MEAL_TYPES.SNACK] }
  ];

  const CATEGORY_EMOJI = {
    [CATEGORIES.SOUP]:   '🍲',
    [CATEGORIES.SALAD]:  '🥗',
    [CATEGORIES.MAIN]:   '🍖',
    [CATEGORIES.BAKERY]: '🥐',
    [CATEGORIES.OTHER]:  '🍽️'
  };
  const CATEGORY_NAMES = {
    [CATEGORIES.SOUP]:   'Суп',
    [CATEGORIES.SALAD]:  'Салат',
    [CATEGORIES.MAIN]:   'Основное',
    [CATEGORIES.BAKERY]: 'Выпечка',
    [CATEGORIES.OTHER]:  'Другое'
  };

  const SWIPE_ACTION_WIDTH = 120;
  const SWIPE_REVEAL_THRESHOLD = SWIPE_ACTION_WIDTH / 2;
  const UNDO_TIMEOUT_MS = 5000;

  function pluralizeRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  // ============================================================
  // ПЛАШКА «ВЕРНУТЬ УДАЛЁННОЕ БЛЮДО»
  // ============================================================
  function closeUndoSnackbar() {
    if (!activeUndoSnackbar) return;
    const el = activeUndoSnackbar;
    activeUndoSnackbar = null;
    if (el._timerId) clearTimeout(el._timerId);
    el.classList.remove('visible');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 250);
  }

  function showUndoSnackbar(dish) {
    closeUndoSnackbar();

    const snackbar = document.createElement('div');
    snackbar.className = 'undo-snackbar';
    snackbar.setAttribute('role', 'status');
    snackbar.setAttribute('aria-live', 'polite');

    const text = document.createElement('span');
    text.className = 'undo-snackbar-text';
    text.textContent = `«${dish.name}» удалено`;
    snackbar.appendChild(text);

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'undo-snackbar-btn';
    undoBtn.textContent = 'Вернуть';
    undoBtn.addEventListener('click', () => {
      DishStore.restoreDish(dish);
      closeUndoSnackbar();
      showMessage('↩️ Блюдо вернули в меню');
    });
    snackbar.appendChild(undoBtn);

    document.body.appendChild(snackbar);
    activeUndoSnackbar = snackbar;

    requestAnimationFrame(() => snackbar.classList.add('visible'));

    snackbar._timerId = setTimeout(() => {
      closeUndoSnackbar();
    }, UNDO_TIMEOUT_MS);
  }

  // ============================================================
  // ГРУППИРОВКА БЛЮД ПО ПРИЁМУ ПИЩИ И СТАТУСУ
  // ============================================================
  function groupDishesByMealType(dishes) {
    const ORDER = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    const NO_TYPE_KEY = '__none__';
    const groups = {};

    dishes.forEach(dish => {
      const types = Array.isArray(dish.mealTypes) ? dish.mealTypes.slice() : [];
      const sortedTypes = types.slice().sort((a, b) => ORDER[a] - ORDER[b]);
      const key = sortedTypes.length === 0 ? NO_TYPE_KEY : sortedTypes.join(',');
      if (!groups[key]) groups[key] = { types: sortedTypes, dishes: [] };
      groups[key].dishes.push(dish);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === NO_TYPE_KEY) return 1;
      if (b === NO_TYPE_KEY) return -1;
      const aIdx = groups[a].types.map(t => ORDER[t]);
      const bIdx = groups[b].types.map(t => ORDER[t]);
      for (let i = 0; i < Math.min(aIdx.length, bIdx.length); i++) {
        if (aIdx[i] !== bIdx[i]) return aIdx[i] - bIdx[i];
      }
      return aIdx.length - bIdx.length;
    });

    return sortedKeys.map(k => groups[k]);
  }

  function renderDayGroups(container, dishes, dateStr) {
    const groups = groupDishesByMealType(dishes);

    groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'day-group';

      if (group.types.length > 0) {
        const title = document.createElement('div');
        title.className = 'day-group-title';
        title.textContent = group.types
          .map(t => MEAL_TYPE_LABELS[t])
          .filter(Boolean)
          .join(', ');
        groupEl.appendChild(title);
      }

      const done = group.dishes.filter(d => d.status === STATUSES.DONE);
      const planned = group.dishes.filter(d => d.status === STATUSES.PLANNED);

      if (done.length > 0) {
        const label = document.createElement('div');
        label.className = 'day-group-status-label';
        label.textContent = 'Приготовлено';
        groupEl.appendChild(label);
        done.forEach(dish => groupEl.appendChild(buildDishElement(dish, dateStr)));
      }

      if (planned.length > 0) {
        const label = document.createElement('div');
        label.className = 'day-group-status-label';
        label.textContent = 'Запланировано';
        groupEl.appendChild(label);
        planned.forEach(dish => groupEl.appendChild(buildDishElement(dish, dateStr)));
      }

      container.appendChild(groupEl);
    });
  }

  function buildDishElement(dish, dateStr) {
    const wrap = document.createElement('div');
    wrap.className = 'dish-swipe-wrap';

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'dish-swipe-action';
    action.setAttribute('aria-label', `Удалить блюдо ${dish.name}`);
    action.textContent = 'Удалить';
    wrap.appendChild(action);

    const dishDiv = document.createElement('div');
    dishDiv.className = `modal-dish ${dish.status}`;
    if (dish.liked) dishDiv.classList.add('liked');

    const statusToggle = document.createElement('button');
    statusToggle.type = 'button';
    statusToggle.className = 'status-toggle-btn';
    statusToggle.textContent = dish.status === STATUSES.DONE ? '✅' : '📅';
    statusToggle.title = dish.status === STATUSES.DONE
      ? 'Отметить как запланированное'
      : 'Отметить как приготовленное';
    statusToggle.setAttribute('aria-label', statusToggle.title);
    statusToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      DishStore.toggleStatus(dish.id);
    });
    dishDiv.appendChild(statusToggle);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'dish-name';
    nameSpan.textContent = dish.name;
    nameSpan.setAttribute('role', 'button');
    nameSpan.setAttribute('tabindex', '0');
    nameSpan.setAttribute('aria-label', `Редактировать блюдо ${dish.name}`);
    nameSpan.addEventListener('click', function() {
      openEditDishModal(dish.id);
    });
    nameSpan.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEditDishModal(dish.id);
      }
    });
    dishDiv.appendChild(nameSpan);

    const recipeCol = document.createElement('div');
    recipeCol.className = 'dish-recipe';
    if (dish.recipeId) {
      const recipeChip = document.createElement('button');
      recipeChip.type = 'button';
      recipeChip.className = 'recipe-chip';
      recipeChip.textContent = '📖 Рецепт';
      recipeChip.title = 'Открыть рецепт';
      recipeChip.setAttribute('aria-label', `Открыть рецепт блюда ${dish.name}`);
      recipeChip.addEventListener('click', function(e) {
        e.stopPropagation();
        const recipe = RecipeStore.getById(dish.recipeId);
        if (recipe) showRecipeCard(recipe);
        else showMessage('Рецепт не найден', 'error');
      });
      recipeCol.appendChild(recipeChip);
    }
    dishDiv.appendChild(recipeCol);

    const actions = document.createElement('div');
    actions.className = 'dish-actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = `thumb-btn thumb-up ${dish.liked ? 'active' : ''}`;
    upBtn.textContent = '👍';
    upBtn.title = dish.liked ? 'Убрать оценку «нравится»' : 'Нравится';
    upBtn.setAttribute('aria-label', dish.liked ? 'Убрать оценку нравится' : 'Отметить как понравившееся');
    upBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      DishStore.toggleThumbUp(dish.id);
    });
    actions.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = `thumb-btn thumb-down ${dish.disliked ? 'active' : ''}`;
    downBtn.textContent = '👎';
    downBtn.title = dish.disliked ? 'Убрать оценку «не нравится»' : 'Не нравится';
    downBtn.setAttribute('aria-label', dish.disliked ? 'Убрать оценку не нравится' : 'Отметить как непонравившееся');
    downBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      DishStore.toggleThumbDown(dish.id);
    });
    actions.appendChild(downBtn);

    dishDiv.appendChild(actions);

    if (dish.note) {
      const noteSpan = document.createElement('div');
      noteSpan.className = 'dish-note';
      noteSpan.textContent = dish.note;
      dishDiv.appendChild(noteSpan);
    }

    wrap.appendChild(dishDiv);

    let startX = 0, startY = 0;
    let currentShift = 0;
    let directionLocked = null;
    let startedOnButton = false;
    let opened = false;
    let movedBySwipe = false;

    function applyShift(px, animate) {
      if (animate) {
        dishDiv.classList.remove('swiping');
      } else {
        dishDiv.classList.add('swiping');
      }
      currentShift = px;
      dishDiv.style.transform = px === 0 ? '' : `translateX(${px}px)`;
      wrap.classList.toggle('is-shifted', px !== 0);
    }

    function closeSwipe() {
      opened = false;
      applyShift(0, true);
      if (openSwipeCard === wrap) openSwipeCard = null;
    }

    function openSwipe() {
      if (openSwipeCard && openSwipeCard !== wrap && openSwipeCard._closeSwipe) {
        openSwipeCard._closeSwipe();
      }
      opened = true;
      applyShift(-SWIPE_ACTION_WIDTH, true);
      openSwipeCard = wrap;
    }

    wrap._closeSwipe = closeSwipe;

    dishDiv.addEventListener('touchstart', function(e) {
      if (e.target.closest('button') && !opened) {
        startedOnButton = true;
        return;
      }
      startedOnButton = false;
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      directionLocked = null;
      movedBySwipe = false;
    }, { passive: true });

    dishDiv.addEventListener('touchmove', function(e) {
      if (startedOnButton) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!directionLocked) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          directionLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
          if (directionLocked === 'h') {
            dishDiv.classList.add('swiping');
            movedBySwipe = true;
          }
        }
      }
      if (directionLocked !== 'h') return;

      e.preventDefault();
      const base = opened ? -SWIPE_ACTION_WIDTH : 0;
      let shift = base + dx;
      if (shift > 0) shift = 0;
      if (shift < -SWIPE_ACTION_WIDTH - 16) shift = -SWIPE_ACTION_WIDTH - 16;
      currentShift = shift;
      dishDiv.style.transform = `translateX(${shift}px)`;
      wrap.classList.toggle('is-shifted', shift !== 0);
    }, { passive: false });

    dishDiv.addEventListener('touchend', function() {
      if (startedOnButton) { startedOnButton = false; return; }
      if (directionLocked !== 'h') {
        directionLocked = null;
        return;
      }
      dishDiv.classList.remove('swiping');
      if (currentShift <= -SWIPE_REVEAL_THRESHOLD) {
        openSwipe();
      } else {
        closeSwipe();
      }
      directionLocked = null;
    }, { passive: true });

    dishDiv.addEventListener('touchcancel', function() {
      startedOnButton = false;
      directionLocked = null;
      dishDiv.classList.remove('swiping');
      if (opened) {
        applyShift(-SWIPE_ACTION_WIDTH, true);
      } else {
        applyShift(0, true);
      }
    }, { passive: true });

    dishDiv.addEventListener('click', function(e) {
      if (movedBySwipe) {
        e.stopPropagation();
        e.preventDefault();
        movedBySwipe = false;
        return;
      }
      if (opened) {
        e.stopPropagation();
        e.preventDefault();
        closeSwipe();
      }
    }, true);

    action.addEventListener('click', function(e) {
      e.stopPropagation();
      const dishSnapshot = {
        ...dish,
        mealTypes: Array.isArray(dish.mealTypes) ? dish.mealTypes.slice() : []
      };
      DishStore.removeDish(dish.id);
      if (openSwipeCard === wrap) openSwipeCard = null;
      showUndoSnackbar(dishSnapshot);
    });

    return wrap;
  }

  // ============================================================
  // ЭКРАН «ЧТО ПРИГОТОВИТЬ?»
  // ============================================================

  function applyChoiceFilters(items) {
    const allDishes = DishStore.getAll();
    const result = [];

    items.forEach(item => {
      if (DishStore.isDishNameDisliked(item.name)) return;

      const dish = allDishes.find(d => d.name === item.name);
      if (!dish) return;

      if (choiceFilterMealType) {
        const types = Array.isArray(dish.mealTypes) ? dish.mealTypes : [];
        if (types.length > 0 && !types.includes(choiceFilterMealType)) return;
      }

      const cat = dish.category || Utils.guessCategory(dish.name);
      if (choiceFilterCategory !== 'all' && cat !== choiceFilterCategory) return;

      if (choiceFilterOnlyFavorites) {
        const isLiked = allDishes.some(d => d.name === item.name && d.liked);
        if (!isLiked) return;
      }

      result.push({
        name: item.name,
        lastDoneDate: item.lastDoneDate,
        category: cat,
        recipeId: dish.recipeId || null,
        hasRecipe: !!dish.recipeId
      });
    });

    return result;
  }

  // Пересчитывает отсортированный движком список. Кэшируется в choiceRankedCache.
  // Сбрасывается при смене фильтров или изменении данных.
  function rebuildChoiceRanking() {
    const allItems = DishStore.getAllUniqueWithLastDone();
    const filtered = applyChoiceFilters(allItems);

    const dishesByName = new Map();
    DishStore.getAll().forEach(d => {
      if (!dishesByName.has(d.name)) dishesByName.set(d.name, []);
      dishesByName.get(d.name).push(d);
    });

    choiceRankedCache = RecommendationEngine.rank(filtered, {
      mealType: choiceFilterMealType || null,
      dishesByName
    });
  }

  function renderChoiceChips() {
    const chips = document.querySelectorAll('#choiceMealTypesChips .choice-chip');
    chips.forEach(chip => {
      const isActive = (chip.dataset.mealType || '') === choiceFilterMealType;
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });
  }

  function renderChoiceCategorySelect() {
    const select = document.getElementById('choiceCategorySelect');
    if (select) select.value = choiceFilterCategory;
  }

  function renderChoiceFavoritesCheckbox() {
    const cb = document.getElementById('choiceOnlyFavorites');
    if (cb) cb.checked = choiceFilterOnlyFavorites;
  }

  function renderChoiceResults() {
    const container = document.getElementById('choiceResults');
    const rerollBtn = document.getElementById('choiceRerollBtn');
    if (!container) return;

    container.innerHTML = '';

    // Ранкинг считаем один раз и кэшируем. Внутри score есть небольшой
    // random jitter, поэтому без кэша порядок «прыгал» бы между рендерами.
    if (!choiceRankedCache) {
      rebuildChoiceRanking();
    }

    const ranked = choiceRankedCache;

    if (!ranked || ranked.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'choice-empty';
      empty.textContent = '😌 Ничего не найдено. Попробуйте ослабить фильтры.';
      container.appendChild(empty);
      if (rerollBtn) rerollBtn.hidden = true;
      return;
    }

    if (rerollBtn) rerollBtn.hidden = false;

    const total = ranked.length;
    const takeCount = Math.min(5, total);
    const limited = [];
    for (let i = 0; i < takeCount; i++) {
      limited.push(ranked[(choiceOffset + i) % total]);
    }

    limited.forEach(item => {
      const row = document.createElement('div');
      row.className = 'choice-result-item';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Выбрать дату для блюда ${item.name}`);

      const emoji = document.createElement('span');
      emoji.className = 'choice-result-emoji';
      emoji.textContent = CATEGORY_EMOJI[item.category] || '🍽️';
      emoji.setAttribute('aria-hidden', 'true');
      row.appendChild(emoji);

      const nameWrap = document.createElement('span');
      nameWrap.className = 'choice-result-name';
      nameWrap.textContent = item.name;
      if (item.hasRecipe) {
        const recipeIcon = document.createElement('span');
        recipeIcon.className = 'choice-result-recipe-icon';
        recipeIcon.textContent = ' 📖';
        recipeIcon.title = 'Есть рецепт';
        recipeIcon.setAttribute('aria-label', 'Есть рецепт');
        nameWrap.appendChild(recipeIcon);
      }
      row.appendChild(nameWrap);

      // Строка-объяснение: почему это блюдо предложено. Максимум две
      // причины, чтобы не разрослось на узком экране.
      const meta = document.createElement('span');
      meta.className = 'choice-result-last';
      const reasonsText = (item.reasons || []).slice(0, 2).join(' · ');
      meta.textContent = reasonsText;
      row.appendChild(meta);

      const handleSelect = () => {
        closeChoiceModal();
        setTimeout(() => {
          openAddModal(null, {
            name: item.name,
            recipeId: item.recipeId,
            category: item.category
          });
        }, 0);
      };
      row.addEventListener('click', handleSelect);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });

      container.appendChild(row);
    });
  }

  function renderChoiceScreenDom() {
    renderChoiceChips();
    renderChoiceCategorySelect();
    renderChoiceFavoritesCheckbox();
    renderChoiceResults();
  }

  function openChoiceScreen(mealTypePreset = null) {
    choiceFilterMealType = mealTypePreset || '';
    choiceFilterCategory = 'all';
    choiceFilterOnlyFavorites = false;
    choiceOffset = 0;
    choiceRankedCache = null;

    renderChoiceScreenDom();

    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    if (!overlay) return;
    overlay.classList.add('active');
    trapFocus(overlay, closeChoiceModal);
  }

  function closeChoiceModal() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    if (!overlay) return;
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  }

  // Возврат в «Что приготовить?» из вложенной модалки «Мои рецепты».
  // Фильтры и кэш ранкинга сохраняются — пользователь возвращается туда,
  // откуда ушёл.
  function returnToChoice() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    if (!overlay) return;
    overlay.classList.add('active');
    trapFocus(overlay, closeChoiceModal);
    renderChoiceResults();
  }

  function setChoiceMealType(type) {
    choiceFilterMealType = type || '';
    choiceOffset = 0;
    choiceRankedCache = null;
    renderChoiceChips();
    renderChoiceResults();
  }

  function setChoiceCategory(cat) {
    choiceFilterCategory = cat || 'all';
    choiceOffset = 0;
    choiceRankedCache = null;
    renderChoiceResults();
  }

  function setChoiceOnlyFavorites(flag) {
    choiceFilterOnlyFavorites = !!flag;
    choiceOffset = 0;
    choiceRankedCache = null;
    renderChoiceResults();
  }

  function rerollChoiceDish() {
    if (!choiceRankedCache || choiceRankedCache.length === 0) return;
    // Сдвигаем окно на 5 по уже отсортированному списку.
    choiceOffset = (choiceOffset + 5) % choiceRankedCache.length;
    renderChoiceResults();
  }

  // ============================================================

  function buildAddForm(dateStr) {
    const addSection = document.createElement('div');
    addSection.className = 'modal-add-section';

    const addTitle = document.createElement('h4');
    addTitle.textContent = '➕ Добавить блюдо';
    addSection.appendChild(addTitle);

    const addForm = document.createElement('div');
    addForm.className = 'modal-add-new';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Название';
    nameInput.id = 'modalNewDishName';
    nameInput.className = 'modal-field-input field-full';
    addForm.appendChild(nameInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = '📝 Заметка (рецепт, продукты…)';
    noteInput.id = 'modalNewDishNote';
    noteInput.className = 'modal-field-input field-full';
    addForm.appendChild(noteInput);

    const statusSelect = document.createElement('select');
    statusSelect.id = 'modalNewDishStatus';
    statusSelect.className = 'modal-field-select field-half';
    [STATUSES.PLANNED, STATUSES.DONE].forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val === STATUSES.PLANNED ? '📅 Планирую' : '✅ Приготовлено';
      statusSelect.appendChild(opt);
    });
    addForm.appendChild(statusSelect);

    const categorySelect = document.createElement('select');
    categorySelect.id = 'modalNewDishCategory';
    categorySelect.className = 'modal-field-select field-half';
    CATEGORY_OPTIONS.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.val;
      opt.textContent = cat.label;
      categorySelect.appendChild(opt);
    });
    addForm.appendChild(categorySelect);

    const mealTypesGroup = document.createElement('div');
    mealTypesGroup.className = 'meal-types-group';
    mealTypesGroup.id = 'modalNewDishMealTypesGroup';
    MEAL_TYPE_OPTIONS.forEach(opt => {
      const label = document.createElement('label');
      label.className = 'meal-type-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.mealType = opt.val;
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = opt.label;
      label.appendChild(span);
      mealTypesGroup.appendChild(label);
    });
    addForm.appendChild(mealTypesGroup);

    const recipeSelect = document.createElement('select');
    recipeSelect.id = 'modalNewDishRecipe';
    recipeSelect.className = 'modal-field-select field-half';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Без рецепта';
    recipeSelect.appendChild(defaultOpt);
    RecipeStore.getAll().forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      recipeSelect.appendChild(opt);
    });
    addForm.appendChild(recipeSelect);

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Добавить';
    addBtn.className = 'field-btn';
    addForm.appendChild(addBtn);

    addSection.appendChild(addForm);

    const suggestControls = document.createElement('div');
    suggestControls.className = 'suggest-controls';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Поиск по названию';
    searchInput.id = 'suggestSearch';
    searchInput.className = 'modal-field-input';
    suggestControls.appendChild(searchInput);

    const filterSelect = document.createElement('select');
    filterSelect.id = 'suggestCategoryFilter';
    filterSelect.className = 'modal-field-select';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'Все категории';
    filterSelect.appendChild(allOpt);
    CATEGORY_OPTIONS.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.val;
      opt.textContent = cat.label;
      filterSelect.appendChild(opt);
    });
    suggestControls.appendChild(filterSelect);
    addSection.appendChild(suggestControls);

    const suggestTitle = document.createElement('h4');
    suggestTitle.textContent = '📖 Выбрать из меню';
    suggestTitle.classList.add('suggest-title');
    addSection.appendChild(suggestTitle);

    const suggestList = document.createElement('div');
    suggestList.className = 'modal-suggest-list';
    addSection.appendChild(suggestList);

    function filterSuggestions() {
      const query = searchInput.value.trim().toLowerCase();
      const cat = filterSelect.value;
      const items = suggestList.querySelectorAll('.modal-suggest-item');
      items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        const itemCat = item.dataset.category || '';
        const matchName = name.includes(query);
        const matchCat = cat === 'all' || itemCat === cat;
        item.style.display = (matchName && matchCat) ? '' : 'none';
      });
    }

    const debouncedFilterSuggestions = Utils.debounce(filterSuggestions, 200);
    searchInput.addEventListener('input', debouncedFilterSuggestions);
    filterSelect.addEventListener('change', filterSuggestions);

    function renderSuggestions() {
      const allUnique = DishStore.getAllUniqueWithLastDone();
      const dayDishes = DishStore.getForDate(dateStr);
      const existingNames = dayDishes.map(d => d.name);
      const available = allUnique.filter(item => !existingNames.includes(item.name));
      suggestList.innerHTML = '';
      if (available.length === 0) {
        const noSuggest = document.createElement('div');
        noSuggest.className = 'modal-no-suggest';
        noSuggest.textContent = 'Все блюда уже добавлены на этот день';
        suggestList.appendChild(noSuggest);
      } else {
        available.forEach(item => {
          const suggestItem = document.createElement('div');
          suggestItem.className = 'modal-suggest-item';
          suggestItem.dataset.name = item.name;
          suggestItem.setAttribute('tabindex', '0');
          suggestItem.setAttribute('role', 'button');
          suggestItem.setAttribute('aria-label', `Добавить блюдо ${item.name}`);
          const existingDish = DishStore.getAll().find(d => d.name === item.name);
          const category = existingDish ? existingDish.category : Utils.guessCategory(item.name);
          suggestItem.dataset.category = category;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'suggest-name';
          nameSpan.textContent = item.name;
          suggestItem.appendChild(nameSpan);
          const lastSpan = document.createElement('span');
          lastSpan.className = 'suggest-last';
          if (item.lastDoneDate) {
            lastSpan.textContent = `Последний раз: ${Utils.daysAgo(item.lastDoneDate)}`;
          } else {
            lastSpan.textContent = 'ещё не готовили';
          }
          suggestItem.appendChild(lastSpan);
          const handleSelect = () => {
            const name = item.name;
            const existing = DishStore.getAll().find(d => d.name === name);
            const category = existing ? existing.category : Utils.guessCategory(name);
            const recipeId = existing ? existing.recipeId : null;
            const mealTypes = existing && Array.isArray(existing.mealTypes) ? existing.mealTypes : [];
            DishStore.addDish(name, STATUSES.PLANNED, dateStr, category, false, '', recipeId, mealTypes);
          };
          suggestItem.addEventListener('click', handleSelect);
          suggestItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSelect();
            }
          });
          suggestList.appendChild(suggestItem);
        });
        filterSuggestions();
      }
    }
    renderSuggestions();

    recipeSelect.addEventListener('change', function() {
      const recipeId = this.value;
      if (recipeId) {
        const recipe = RecipeStore.getById(Number(recipeId));
        if (recipe) nameInput.value = recipe.name;
      }
    });

    addBtn.addEventListener('click', function() {
      const name = nameInput.value.trim();
      if (!name) { showMessage('Введи название блюда', 'error'); return; }
      const status = statusSelect.value;
      const category = categorySelect.value;
      const note = document.getElementById('modalNewDishNote').value.trim();
      const recipeId = recipeSelect.value ? Number(recipeSelect.value) : null;
      const checkedBoxes = mealTypesGroup.querySelectorAll('input[type=checkbox]:checked');
      const mealTypes = Array.from(checkedBoxes).map(cb => cb.dataset.mealType);
      DishStore.addDish(name, status, dateStr, category, false, note, recipeId, mealTypes);
      nameInput.value = '';
      document.getElementById('modalNewDishNote').value = '';
      recipeSelect.value = '';
      mealTypesGroup.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    });

    return addSection;
  }

  function renderCalendar(view, date) {
    currentView = view;
    currentDate = date;
    const year = date.getFullYear();
    const month = date.getMonth();
    monthTitle.textContent = `${['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][month]} ${year}`;
    calendarContent.innerHTML = '';
    if (view === 'month') renderMonthView(year, month);
    else renderWeekView(date);
    renderMenu();
    updateViewButtons();
  }

  function updateViewButtons() {
    const btns = document.querySelectorAll(CONSTANTS.SELECTORS.viewToggleButtons);
    btns.forEach(btn => {
      const isActive = btn.dataset.view === currentView;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive);
    });
  }

  function renderMonthView(year, month) {
    const grid = document.createElement('div');
    grid.className = 'days-grid';
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const totalDays = last.getDate();
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6;
    for (let i = 0; i < startDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      grid.appendChild(empty);
    }
    const today = new Date();
    const todayStr = Utils.formatDateLocal(today);
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dateStr = Utils.formatDateLocal(d);
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', `Открыть меню на ${Utils.formatDate(d)}`);
      const dayDishes = DishStore.getForDate(dateStr);
      const hasDone = dayDishes.some(d => d.status === STATUSES.DONE);
      const hasPlanned = dayDishes.some(d => d.status === STATUSES.PLANNED);
      if (hasDone) cell.classList.add('has-done');
      if (hasPlanned) cell.classList.add('has-planned');
      if (hasDone && hasPlanned) cell.classList.add('has-both');
      if (dateStr === todayStr) cell.classList.add('today');
      const numDiv = document.createElement('div');
      numDiv.className = 'day-number';
      numDiv.textContent = d.getDate();
      cell.appendChild(numDiv);

      const statusText = document.createElement('span');
      statusText.className = 'sr-only';
      statusText.textContent = dayDishes.map(d => d.status === STATUSES.DONE ? 'Приготовлено' : 'Планирую').join(', ');
      cell.appendChild(statusText);

      const handleOpen = () => openModal(dateStr);
      cell.addEventListener('click', handleOpen);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      });
      grid.appendChild(cell);
    }
    calendarContent.appendChild(grid);
  }

  function renderWeekView(baseDate) {
    const week = Utils.getWeekDays(baseDate);
    const list = document.createElement('div');
    list.className = 'week-list';

    const hint = document.createElement('div');
    hint.className = 'week-drag-hint';
    hint.textContent = '🔄 Перетащите блюдо на другой день (на мобильном: удерживайте палец)';
    list.appendChild(hint);

    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    week.forEach((day, idx) => {
      const dateStr = Utils.formatDateLocal(day);
      const dayDishes = DishStore.getForDate(dateStr);
      const row = document.createElement('div');
      row.className = 'week-row';
      row.dataset.date = dateStr;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Открыть меню на ${Utils.formatDate(day)}`);
      const dateCol = document.createElement('div');
      dateCol.className = 'date-col';
      dateCol.textContent = day.getDate();
      row.appendChild(dateCol);
      const dayCol = document.createElement('div');
      dayCol.className = 'day-col';
      dayCol.textContent = dayNames[idx];
      row.appendChild(dayCol);
      const mealsCol = document.createElement('div');
      mealsCol.className = 'meals-col';
      if (dayDishes.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'empty-meals';
        empty.textContent = '—';
        mealsCol.appendChild(empty);
      } else {
        dayDishes.forEach(dish => {
          const chip = document.createElement('span');
          chip.className = `meal-chip ${dish.status}`;
          if (dish.liked) chip.classList.add('liked');
          chip.textContent = dish.name;
          chip.draggable = true;
          chip.dataset.id = dish.id;
          chip.dataset.date = dateStr;

          if (dish.recipeId) {
            const badge = document.createElement('span');
            badge.className = 'recipe-badge';
            badge.textContent = '📖';
            badge.title = 'Открыть рецепт';
            badge.setAttribute('aria-label', 'Открыть рецепт');
            badge.addEventListener('click', function(e) {
              e.stopPropagation();
              const recipe = RecipeStore.getById(dish.recipeId);
              if (recipe) showRecipeCard(recipe);
            });
            chip.appendChild(badge);
          }

          let touchDragData = null;
          let longPressTimer = null;
          let wasTouchDragged = false;
          let startX = 0, startY = 0;

          chip.addEventListener('touchstart', (e) => {
            const touch = e.changedTouches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            touchDragData = { dishId: dish.id, fromDate: dateStr, chip: chip };
            wasTouchDragged = false;
            longPressTimer = setTimeout(() => activateTouchDrag(e), 300);
          }, { passive: false });

          const activateTouchDrag = (e) => {
            if (!touchDragData) return;
            touchDragData.chip.classList.add('dragging');
            document.body.style.overflow = 'hidden';
            touchDragActive = true;
            if (longPressTimer) clearTimeout(longPressTimer);
          };

          chip.addEventListener('touchmove', (e) => {
            if (!touchDragData) return;
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - startX);
            const dy = Math.abs(touch.clientY - startY);
            if (!touchDragActive && (dx > 10 || dy > 10)) {
              if (dx > dy && dx > 10) {
                if (longPressTimer) clearTimeout(longPressTimer);
                activateTouchDrag(e);
              } else {
                if (longPressTimer) clearTimeout(longPressTimer);
                touchDragData = null;
                return;
              }
            }
            if (touchDragActive && touchDragData) {
              e.preventDefault();
              const element = document.elementFromPoint(touch.clientX, touch.clientY);
              const targetRow = element ? element.closest('.week-row') : null;
              document.querySelectorAll('.week-row').forEach(r => r.classList.remove('drag-over'));
              if (targetRow) targetRow.classList.add('drag-over');
              touchDragData.targetRow = targetRow;
            }
          }, { passive: false });

          chip.addEventListener('touchend', (e) => {
            if (longPressTimer) clearTimeout(longPressTimer);
            if (touchDragActive && touchDragData) {
              e.preventDefault();
              const targetRow = touchDragData.targetRow;
              if (targetRow && targetRow.dataset.date && targetRow.dataset.date !== touchDragData.fromDate) {
                DishStore.updateDishDate(touchDragData.dishId, targetRow.dataset.date);
                wasTouchDragged = true;
              }
              document.body.style.overflow = '';
              touchDragActive = false;
              touchDragData.chip.classList.remove('dragging');
              document.querySelectorAll('.week-row').forEach(r => r.classList.remove('drag-over'));
              touchDragData = null;
            }
          }, { passive: false });

          const originalClickHandler = (e) => {
            if (wasTouchDragged) {
              e.preventDefault();
              e.stopPropagation();
              wasTouchDragged = false;
              return;
            }
            if (e.target.closest('.recipe-badge')) return;
            if (e.detail > 0) openModal(dateStr);
          };
          chip.addEventListener('click', originalClickHandler);
          mealsCol.appendChild(chip);
        });
      }
      row.appendChild(mealsCol);
      const handleOpen = () => openModal(dateStr);
      row.addEventListener('click', (e) => {
        if (e.target.closest('.meal-chip')) return;
        handleOpen();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.target.closest('.meal-chip')) handleOpen();
        }
      });
      list.appendChild(row);
    });
    calendarContent.appendChild(list);
  }

  function renderMenu() {
    menuPeriod.textContent = currentView === 'month' ? 'месяц' : 'неделю';
    let days = [];
    if (currentView === 'month') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const last = new Date(year, month + 1, 0);
      for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    } else {
      days = Utils.getWeekDays(currentDate);
    }
    let allDishes = [];
    days.forEach(day => {
      const dateStr = Utils.formatDateLocal(day);
      const dayDishes = DishStore.getForDate(dateStr);
      dayDishes.forEach(dish => {
        allDishes.push({ ...dish, displayDate: Utils.formatDate(day) });
      });
    });
    let filtered = allDishes;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(d => d.name.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') filtered = filtered.filter(d => d.status === statusFilter);
    if (categoryFilter !== 'all') filtered = filtered.filter(d => d.category === categoryFilter);

    const grouped = {};
    filtered.forEach(dish => {
      if (!grouped[dish.date]) grouped[dish.date] = [];
      grouped[dish.date].push(dish);
    });
    const sortedDates = Object.keys(grouped).sort();
    menuContent.innerHTML = '';
    if (sortedDates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'menu-empty';
      empty.textContent = '😌 Нет блюд, соответствующих фильтрам';
      menuContent.appendChild(empty);
      return;
    }
    sortedDates.forEach(dateStr => {
      const dayDishes = grouped[dateStr];
      const displayDate = dayDishes[0].displayDate || Utils.formatDate(new Date(dateStr));
      const group = document.createElement('div');
      group.className = 'menu-group';
      const dateEl = document.createElement('div');
      dateEl.className = 'menu-date';
      dateEl.textContent = displayDate;
      group.appendChild(dateEl);
      dayDishes.forEach(dish => {
        let categoryClass = '';
        if (dish.category === CATEGORIES.SOUP) categoryClass = 'category-soup';
        else if (dish.category === CATEGORIES.SALAD) categoryClass = 'category-salad';
        else if (dish.category === CATEGORIES.MAIN) categoryClass = 'category-main';
        else if (dish.category === CATEGORIES.BAKERY) categoryClass = 'category-bakery';
        const item = document.createElement('div');
        item.className = `menu-item ${dish.status} ${categoryClass}`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'menu-item-name';
        nameSpan.textContent = dish.name;
        nameSpan.setAttribute('role', 'button');
        nameSpan.setAttribute('tabindex', '0');
        nameSpan.setAttribute('aria-label', `Редактировать блюдо ${dish.name}`);
        nameSpan.addEventListener('click', () => openEditDishModal(dish.id));
        nameSpan.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openEditDishModal(dish.id);
          }
        });
        item.appendChild(nameSpan);

        const badge = document.createElement('span');
        badge.className = 'status-badge';
        badge.textContent = dish.status === STATUSES.DONE ? '✅' : '📅';
        item.appendChild(badge);

        group.appendChild(item);
      });
      menuContent.appendChild(group);
    });
  }

  // Подсказки на экране «Сегодня» — свёрнуты в <details>,
  // чтобы не отъедать экран. Разворачиваются по тапу.
  function buildTodayHints() {
    const details = document.createElement('details');
    details.className = 'today-hints';

    const summary = document.createElement('summary');
    summary.className = 'today-hints-summary';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'today-hints-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = '💡';
    summary.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'today-hints-label';
    labelSpan.textContent = 'Что означают значки?';
    summary.appendChild(labelSpan);

    const chevron = document.createElement('span');
    chevron.className = 'today-hints-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    summary.appendChild(chevron);

    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'today-hints-body';

    const rows = [
      ['📅', 'Планирую. Когда приготовишь — тапни календарик, и статус сменится на «Приготовлено».'],
      ['✅', 'Приготовлено — блюдо уже готовили.'],
      ['👍', 'Ставь палец вверх — блюдо попадёт в любимые и будет участвовать в рекомендациях «Что приготовить?».'],
      ['👎', 'Не понравилось? Поставь палец вниз — больше не увидишь это блюдо в рекомендациях.']
    ];

    rows.forEach(([icon, text]) => {
      const row = document.createElement('div');
      row.className = 'today-hint-row';

      const iconEl = document.createElement('span');
      iconEl.className = 'today-hint-icon';
      iconEl.textContent = icon;
      iconEl.setAttribute('aria-hidden', 'true');
      row.appendChild(iconEl);

      const textEl = document.createElement('span');
      textEl.textContent = text;
      row.appendChild(textEl);

      body.appendChild(row);
    });

    details.appendChild(body);
    return details;
  }

  function renderToday() {
    const container = document.getElementById(CONSTANTS.SELECTORS.todayContent);
    if (!container) return;
    container.innerHTML = '';

    const today = new Date();
    const dateStr = Utils.formatDateLocal(today);
    const dayDishes = DishStore.getForDate(dateStr);

    const header = document.createElement('div');
    header.className = 'today-header';

    const dateEl = document.createElement('div');
    dateEl.className = 'today-date';
    dateEl.textContent = Utils.formatDate(today);
    header.appendChild(dateEl);

    const countEl = document.createElement('div');
    countEl.className = 'today-count';
    if (dayDishes.length === 0) {
      countEl.textContent = 'Ничего не запланировано';
    } else {
      const word = pluralizeRu(dayDishes.length, 'блюдо', 'блюда', 'блюд');
      countEl.textContent = `${dayDishes.length} ${word}`;
    }
    header.appendChild(countEl);

    container.appendChild(header);

    if (dayDishes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'today-empty';

      const icon = document.createElement('div');
      icon.className = 'today-empty-icon';
      icon.textContent = '🍽️';
      icon.setAttribute('aria-hidden', 'true');
      empty.appendChild(icon);

      const text = document.createElement('p');
      text.className = 'today-empty-text';
      text.textContent = 'На сегодня пока ничего не запланировано.';
      empty.appendChild(text);

      container.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'today-dishes';
      renderDayGroups(list, dayDishes, dateStr);
      container.appendChild(list);
    }

    const actions = document.createElement('div');
    actions.className = 'today-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'today-action-btn today-action-add';
    addBtn.textContent = '➕ Добавить блюдо';
    addBtn.addEventListener('click', () => openAddModal(dateStr));
    actions.appendChild(addBtn);

    const suggestBtn = document.createElement('button');
    suggestBtn.type = 'button';
    suggestBtn.className = 'today-action-btn today-action-suggest';
    suggestBtn.textContent = '🤔 Что приготовить на ужин?';
    suggestBtn.addEventListener('click', () => {
      openChoiceScreen(MEAL_TYPES.DINNER);
    });
    actions.appendChild(suggestBtn);

    container.appendChild(actions);

    if (dayDishes.length > 0) {
      container.appendChild(buildTodayHints());
    }
  }

  function openModal(dateStr) {
    currentModalDate = dateStr;
    const d = new Date(dateStr);
    const dayDishes = DishStore.getForDate(dateStr);
    const dishWord = pluralizeRu(dayDishes.length, 'блюдо', 'блюда', 'блюд');
    modalDate.textContent = `${Utils.formatDate(d)} (${dayDishes.length} ${dishWord})`;
    modalContent.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'day-meals-section';
    const title = document.createElement('h4');
    title.textContent = '📋 Меню на день';
    section.appendChild(title);
    if (dayDishes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = '😌 На этот день пока ничего нет';
      section.appendChild(empty);
    } else {
      renderDayGroups(section, dayDishes, dateStr);
    }
    modalContent.appendChild(section);

    if (dayDishes.length > 0) {
      const repeatBtn = document.createElement('button');
      repeatBtn.type = 'button';
      repeatBtn.className = 'repeat-menu-btn';
      repeatBtn.textContent = '🔄 Повторить меню на другой день';
      repeatBtn.addEventListener('click', function() {
        openRepeatMenuModal(dateStr);
      });
      modalContent.appendChild(repeatBtn);
    }

    modalContent.appendChild(buildAddForm(dateStr));

    modalOverlay.classList.add('active');
    trapFocus(modalOverlay, closeModal);
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    if (modalOverlay._trapFocusCleanup) {
      modalOverlay._trapFocusCleanup();
      delete modalOverlay._trapFocusCleanup;
    }
    currentModalDate = null;
  }

  function openEditDishModal(dishId) {
    const dish = DishStore.getAll().find(d => d.id === dishId);
    if (!dish) { showMessage('Блюдо не найдено', 'error'); return; }

    const overlay = document.getElementById(CONSTANTS.SELECTORS.editDishOverlay);
    if (!overlay) return;

    document.getElementById(CONSTANTS.SELECTORS.editDishId).value = dish.id;
    document.getElementById(CONSTANTS.SELECTORS.editDishName).value = dish.name;
    document.getElementById(CONSTANTS.SELECTORS.editDishNote).value = dish.note || '';
    document.getElementById(CONSTANTS.SELECTORS.editDishStatus).value = dish.status;
    document.getElementById(CONSTANTS.SELECTORS.editDishCategory).value = dish.category || CATEGORIES.OTHER;

    const editMealTypesGroup = document.getElementById(CONSTANTS.SELECTORS.editDishMealTypesGroup);
    if (editMealTypesGroup) {
      const currentMealTypes = Array.isArray(dish.mealTypes) ? dish.mealTypes : [];
      editMealTypesGroup.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = currentMealTypes.includes(cb.dataset.mealType);
      });
    }

    const recipeSelect = document.getElementById(CONSTANTS.SELECTORS.editDishRecipe);
    recipeSelect.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Без рецепта';
    recipeSelect.appendChild(defaultOpt);
    RecipeStore.getAll().forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      recipeSelect.appendChild(opt);
    });
    recipeSelect.value = dish.recipeId ? String(dish.recipeId) : '';

    overlay.classList.add('active');
    trapFocus(overlay, closeEditDishModal);

    const nameInput = document.getElementById(CONSTANTS.SELECTORS.editDishName);
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
  }

  function closeEditDishModal() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.editDishOverlay);
    if (!overlay) return;
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  }

  function saveEditDishModal() {
    const id = Number(document.getElementById(CONSTANTS.SELECTORS.editDishId).value);
    const name = document.getElementById(CONSTANTS.SELECTORS.editDishName).value.trim();
    const note = document.getElementById(CONSTANTS.SELECTORS.editDishNote).value.trim();
    const status = document.getElementById(CONSTANTS.SELECTORS.editDishStatus).value;
    const category = document.getElementById(CONSTANTS.SELECTORS.editDishCategory).value;
    const recipeValue = document.getElementById(CONSTANTS.SELECTORS.editDishRecipe).value;
    const recipeId = recipeValue ? Number(recipeValue) : null;

    const editMealTypesGroup = document.getElementById(CONSTANTS.SELECTORS.editDishMealTypesGroup);
    let mealTypes = [];
    if (editMealTypesGroup) {
      const checkedBoxes = editMealTypesGroup.querySelectorAll('input[type=checkbox]:checked');
      mealTypes = Array.from(checkedBoxes).map(cb => cb.dataset.mealType);
    }

    if (!name) { showMessage('Введите название блюда', 'error'); return; }

    DishStore.updateDish(id, { name, status, category, note, recipeId, mealTypes });
    closeEditDishModal();
    showMessage(`✅ Блюдо "${name}" обновлено`);
  }

  function openRepeatMenuModal(sourceDate) {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.repeatMenuOverlay);
    if (!overlay) return;

    document.getElementById(CONSTANTS.SELECTORS.repeatMenuSourceDate).value = sourceDate;

    const d = new Date(sourceDate);
    d.setDate(d.getDate() + 1);
    document.getElementById(CONSTANTS.SELECTORS.repeatMenuDate).value = Utils.formatDateLocal(d);

    const subtitle = document.getElementById('repeatMenuSubtitle');
    if (subtitle) {
      subtitle.textContent = `Куда скопировать блюда из ${Utils.formatDate(new Date(sourceDate))}?`;
    }

    overlay.classList.add('active');
    trapFocus(overlay, closeRepeatMenuModal);
  }

  function closeRepeatMenuModal() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.repeatMenuOverlay);
    if (!overlay) return;
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  }

  function executeRepeatMenu() {
    const sourceDate = document.getElementById(CONSTANTS.SELECTORS.repeatMenuSourceDate).value;
    const targetDate = document.getElementById(CONSTANTS.SELECTORS.repeatMenuDate).value;

    if (!targetDate) { showMessage('Выберите дату', 'error'); return; }
    if (sourceDate === targetDate) { showMessage('Выберите другой день', 'error'); return; }

    const sourceDishes = DishStore.getForDate(sourceDate);
    if (sourceDishes.length === 0) {
      showMessage('Нечего повторять — на исходном дне нет блюд', 'error');
      return;
    }

    let added = 0;
    sourceDishes.forEach(dish => {
      DishStore.addDish(
        dish.name,
        STATUSES.PLANNED,
        targetDate,
        dish.category,
        false,
        dish.note || '',
        dish.recipeId || null,
        dish.mealTypes || []
      );
      added++;
    });

    closeRepeatMenuModal();
    const word = pluralizeRu(added, 'блюдо', 'блюда', 'блюд');
    showMessage(`✅ Скопировано ${added} ${word} на ${Utils.formatDate(new Date(targetDate))}`);
  }

  function addDishToTomorrow(name, recipeId = null, closeModalCallback) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = Utils.formatDateLocal(tomorrow);

    let category = null;
    let finalRecipeId = recipeId;
    let mealTypes = [];

    if (finalRecipeId !== null) {
      const recipe = RecipeStore.getById(finalRecipeId);
      if (recipe) {
        category = recipe.category || Utils.guessCategory(name);
      } else {
        finalRecipeId = null;
        category = Utils.guessCategory(name);
      }
    } else {
      const existing = DishStore.getAll().find(d => d.name === name);
      category = existing ? existing.category : Utils.guessCategory(name);
      finalRecipeId = existing && existing.recipeId ? existing.recipeId : null;
      mealTypes = existing && Array.isArray(existing.mealTypes) ? existing.mealTypes : [];
    }

    DishStore.addDish(name, STATUSES.PLANNED, dateStr, category, false, '', finalRecipeId, mealTypes);
    if (typeof closeModalCallback === 'function') closeModalCallback();
    showMessage(`✅ Блюдо "${name}" добавлено в план на завтра (${Utils.formatDate(tomorrow)})`);
  }

  function openAddModal(dateStr = null, prefill = {}) {
    let defaultDate;
    if (dateStr) {
      defaultDate = new Date(dateStr);
    } else if (prefill.date) {
      defaultDate = new Date(prefill.date);
    } else {
      defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 1);
    }
    document.getElementById(CONSTANTS.SELECTORS.newDishDate).value = Utils.formatDateLocal(defaultDate);
    document.getElementById(CONSTANTS.SELECTORS.newDishName).value = '';
    document.getElementById(CONSTANTS.SELECTORS.newDishNote).value = '';
    document.getElementById(CONSTANTS.SELECTORS.newDishStatus).value = STATUSES.PLANNED;
    document.getElementById(CONSTANTS.SELECTORS.newDishCategory).value = CATEGORIES.MAIN;

    const addMealTypesGroup = document.getElementById(CONSTANTS.SELECTORS.newDishMealTypesGroup);
    if (addMealTypesGroup) {
      addMealTypesGroup.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    }

    const recipeSelect = document.getElementById(CONSTANTS.SELECTORS.newDishRecipe);
    if (recipeSelect) {
      recipeSelect.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'Без рецепта';
      recipeSelect.appendChild(defaultOpt);
      RecipeStore.getAll().forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        recipeSelect.appendChild(opt);
      });
      recipeSelect.value = '';
    }

    if (prefill.name) {
      document.getElementById(CONSTANTS.SELECTORS.newDishName).value = prefill.name;
    }
    if (prefill.category) {
      document.getElementById(CONSTANTS.SELECTORS.newDishCategory).value = prefill.category;
    }
    if (prefill.recipeId && recipeSelect) {
      recipeSelect.value = String(prefill.recipeId);
    }
    if (Array.isArray(prefill.mealTypes) && addMealTypesGroup) {
      addMealTypesGroup.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = prefill.mealTypes.includes(cb.dataset.mealType);
      });
    }

    const overlay = document.getElementById(CONSTANTS.SELECTORS.addModalOverlay);
    overlay.classList.add('active');
    trapFocus(overlay, closeAddModal);

    const nameField = document.getElementById(CONSTANTS.SELECTORS.newDishName);
    setTimeout(() => {
      if (nameField.value) {
        nameField.select();
      } else {
        nameField.focus();
      }
    }, 60);
  }

  function closeAddModal() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.addModalOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  }

  function setSearchQuery(q) { searchQuery = q; renderMenu(); }
  function setStatusFilter(f) { statusFilter = f; renderMenu(); }
  function setCategoryFilter(f) { categoryFilter = f; renderMenu(); }

  function showRecipeCard(recipe) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.display = 'flex';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'recipeCardTitle');

    const modal = document.createElement('div');
    modal.className = 'modal recipe-view-modal';

    const header = document.createElement('div');
    header.className = 'modal-header recipe-view-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'recipe-view-titlerow';

    const title = document.createElement('h3');
    title.id = 'recipeCardTitle';
    title.textContent = '📖 ' + recipe.name;
    titleRow.appendChild(title);

    const cat = recipe.category || Utils.guessCategory(recipe.name);
    const categoryBadge = document.createElement('span');
    categoryBadge.className = `recipe-category-badge category-${cat}`;
    categoryBadge.textContent = `${CATEGORY_EMOJI[cat] || '🍽️'} ${CATEGORY_NAMES[cat] || 'Другое'}`;
    titleRow.appendChild(categoryBadge);

    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.id = 'recipeCardClose';
    closeButton.textContent = '✕';
    closeButton.setAttribute('aria-label', 'Закрыть');

    header.appendChild(titleRow);
    header.appendChild(closeButton);
    modal.appendChild(header);

    const ingredientsDiv = document.createElement('div');
    ingredientsDiv.className = 'recipe-section recipe-ingredients';

    const ingredientsTitle = document.createElement('h4');
    ingredientsTitle.className = 'recipe-section-title';
    ingredientsTitle.textContent = '📝 Ингредиенты';
    ingredientsDiv.appendChild(ingredientsTitle);

    const ingredientsList = document.createElement('ul');
    ingredientsList.className = 'recipe-ingredients-list';
    recipe.ingredients.forEach(ing => {
      const li = document.createElement('li');
      li.textContent = ing;
      ingredientsList.appendChild(li);
    });
    ingredientsDiv.appendChild(ingredientsList);
    modal.appendChild(ingredientsDiv);

    if (recipe.instructions) {
      const instrDiv = document.createElement('div');
      instrDiv.className = 'recipe-section recipe-instructions';

      const instrTitle = document.createElement('h4');
      instrTitle.className = 'recipe-section-title';
      instrTitle.textContent = '👨‍🍳 Инструкция';
      instrDiv.appendChild(instrTitle);

      const pre = document.createElement('pre');
      pre.className = 'recipe-instructions-text';
      pre.textContent = recipe.instructions;
      instrDiv.appendChild(pre);
      modal.appendChild(instrDiv);
    }

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'recipe-card-buttons';
    const addButton = document.createElement('button');
    addButton.className = 'btn-primary';
    addButton.id = 'addRecipeToCalendar';
    addButton.textContent = '➕ Добавить в календарь';
    const closeButton2 = document.createElement('button');
    closeButton2.className = 'btn-secondary';
    closeButton2.id = 'recipeCardCloseBtn';
    closeButton2.textContent = 'Закрыть';
    buttonsDiv.appendChild(addButton);
    buttonsDiv.appendChild(closeButton2);
    modal.appendChild(buttonsDiv);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      if (overlay._trapFocusCleanup) {
        overlay._trapFocusCleanup();
        delete overlay._trapFocusCleanup;
      }
      overlay.remove();
    };
    overlay._closeFn = close;
    closeButton.addEventListener('click', close);
    closeButton2.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    addButton.addEventListener('click', function() {
      addDishToTomorrow(recipe.name, recipe.id, close);
    });

    trapFocus(overlay, close);
  }

  function initEventListeners() {
    EventBus.on(CONSTANTS.EVENTS.DISHES_CHANGED, () => {
      renderCalendar(currentView, currentDate);
      if (modalOverlay.classList.contains('active') && currentModalDate) {
        openModal(currentModalDate);
      }
      renderToday();
      const choiceOverlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
      if (choiceOverlay && choiceOverlay.classList.contains('active')) {
        // Данные изменились — кэш ранкинга устарел.
        choiceRankedCache = null;
        renderChoiceResults();
      }
    });

    const editOverlay = document.getElementById(CONSTANTS.SELECTORS.editDishOverlay);
    if (editOverlay) {
      document.getElementById(CONSTANTS.SELECTORS.editDishClose).addEventListener('click', closeEditDishModal);
      document.getElementById(CONSTANTS.SELECTORS.editDishCancel).addEventListener('click', closeEditDishModal);
      document.getElementById(CONSTANTS.SELECTORS.editDishSave).addEventListener('click', saveEditDishModal);
      editOverlay.addEventListener('click', function(e) {
        if (e.target === this) closeEditDishModal();
      });
      document.getElementById(CONSTANTS.SELECTORS.editDishRecipe).addEventListener('change', function() {
        if (!this.value) return;
        const recipe = RecipeStore.getById(Number(this.value));
        if (recipe) {
          document.getElementById(CONSTANTS.SELECTORS.editDishName).value = recipe.name;
        }
      });
    }

    const addRecipeSelect = document.getElementById(CONSTANTS.SELECTORS.newDishRecipe);
    if (addRecipeSelect) {
      addRecipeSelect.addEventListener('change', function() {
        if (!this.value) return;
        const recipe = RecipeStore.getById(Number(this.value));
        if (recipe) {
          document.getElementById(CONSTANTS.SELECTORS.newDishName).value = recipe.name;
        }
      });
    }

    const repeatOverlay = document.getElementById(CONSTANTS.SELECTORS.repeatMenuOverlay);
    if (repeatOverlay) {
      document.getElementById(CONSTANTS.SELECTORS.repeatMenuClose).addEventListener('click', closeRepeatMenuModal);
      document.getElementById(CONSTANTS.SELECTORS.repeatMenuCancel).addEventListener('click', closeRepeatMenuModal);
      document.getElementById(CONSTANTS.SELECTORS.repeatMenuSave).addEventListener('click', executeRepeatMenu);
      repeatOverlay.addEventListener('click', function(e) {
        if (e.target === this) closeRepeatMenuModal();
      });
    }
  }

  initEventListeners();

  return {
    renderCalendar, renderMenu, renderToday, openModal, closeModal,
    openAddModal, closeAddModal,
    setSearchQuery, setStatusFilter, setCategoryFilter,
    getCurrentDate: () => currentDate,
    getCurrentView: () => currentView,
    setCurrentDate: (d) => { currentDate = d; },
    setCurrentView: (v) => { currentView = v; },
    showRecipeCard,
    closeEditDishModal,
    closeRepeatMenuModal,
    openChoiceScreen,
    closeChoiceModal,
    returnToChoice,
    setChoiceMealType,
    setChoiceCategory,
    setChoiceOnlyFavorites,
    rerollChoiceDish
  };
})();

export const openChoiceScreen = Renderer.openChoiceScreen;
export const closeChoiceModal = Renderer.closeChoiceModal;
export const setChoiceMealType = Renderer.setChoiceMealType;
export const setChoiceCategory = Renderer.setChoiceCategory;
export const setChoiceOnlyFavorites = Renderer.setChoiceOnlyFavorites;
export const rerollChoiceDish = Renderer.rerollChoiceDish;
