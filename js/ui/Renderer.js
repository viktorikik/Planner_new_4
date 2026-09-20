import { STATUSES, CATEGORIES, CATEGORY_LABELS, MEAL_TYPES, MEAL_TYPE_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';

export const Renderer = (function() {
  let currentView = 'week';
  let currentDate = new Date();
  let searchQuery = '', statusFilter = 'all', categoryFilter = 'all';
  let currentModalDate = null;

  // Флаг активного touch-драга. Раньше жил в window.__touchDragActive —
  // вынесен в замыкание, чтобы не загрязнять глобальную область.
  let touchDragActive = false;

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
  const recOverlay = els.recOverlay;
  const recTitle = els.recTitle;
  const recContent = els.recContent;

  const CATEGORY_OPTIONS = [
    { val: CATEGORIES.SOUP,   label: '🍲 Суп' },
    { val: CATEGORIES.SALAD,  label: '🥗 Салат' },
    { val: CATEGORIES.MAIN,   label: '🍖 Основное' },
    { val: CATEGORIES.BAKERY, label: '🥐 Выпечка' },
    { val: CATEGORIES.OTHER,  label: '🍽️ Другое' }
  ];

  // Опции для чекбоксов «Приём пищи» (без пустого варианта — чекбоксы сами
  // означают «отмечено / не отмечено»).
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

  function pluralizeRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  // ============================================================
  // ГРУППИРОВКА БЛЮД ПО ПРИЁМУ ПИЩИ И СТАТУСУ (v4.0)
  // ============================================================
  // Группирует блюда по набору приёмов пищи (mealTypes).
  // Блюдо с mealTypes = ['lunch', 'dinner'] попадает в одну группу
  // с заголовком «ОБЕД, УЖИН». Блюда без типа — в конце, без заголовка.
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

  // Рендерит блюда как серию групп: приём пищи → статус → карточки.
  // Используется в модалке дня и на экране «Сегодня».
  function renderDayGroups(container, dishes, dateStr) {
    const groups = groupDishesByMealType(dishes);

    groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'day-group';

      // ---- Заголовок группы (капсом) — только если есть типы ----
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

  // Карточка блюда в четырёхколоночной раскладке:
  //   [✅/📅] [название растёт, переносится] [📖 Рецепт] [👍 👎 🗑️]
  // При наличии заметки — отдельная строка снизу на всю ширину.
  function buildDishElement(dish, dateStr) {
    const dishDiv = document.createElement('div');
    dishDiv.className = `modal-dish ${dish.status}`;
    if (dish.liked) dishDiv.classList.add('liked');

    // ---- Колонка 1: переключатель статуса ----
    // Тап переключает done ↔ planned, блюдо переезжает в другую
    // группу автоматически через dishes:changed.
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

    // ---- Колонка 2: название ----
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

    // ---- Колонка 3: рецепт (пустая, если нет) ----
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

    // ---- Колонка 4: действия (👍 👎 🗑️) ----
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

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Удалить';
    deleteBtn.setAttribute('aria-label', 'Удалить блюдо');
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('Удалить это блюдо?')) {
        DishStore.removeDish(dish.id);
      }
    });
    actions.appendChild(deleteBtn);

    dishDiv.appendChild(actions);

    // ---- Заметка (опционально, на всю ширину) ----
    if (dish.note) {
      const noteSpan = document.createElement('div');
      noteSpan.className = 'dish-note';
      noteSpan.textContent = dish.note;
      dishDiv.appendChild(noteSpan);
    }

    return dishDiv;
  }

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

    // ---- Приём пищи (v4.0): мультивыбор через чекбоксы ----
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
            // Переносим mealTypes из существующей записи, если они есть
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
      // ---- Приём пищи (v4.0): собираем массив из отмеченных чекбоксов ----
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

  // Экран «Сегодня» — меню на текущую дату одним взглядом.
  // Рендерится в контейнер #todayContent (таб data-tab-view="today").
  function renderToday() {
    const container = document.getElementById(CONSTANTS.SELECTORS.todayContent);
    if (!container) return;
    container.innerHTML = '';

    const today = new Date();
    const dateStr = Utils.formatDateLocal(today);
    const dayDishes = DishStore.getForDate(dateStr);

    // ----- Заголовок с датой и счётчиком -----
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

    // ----- Список блюд или пустое состояние -----
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

    // ----- Кнопки быстрых действий -----
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
      const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
      if (!overlay) return;
      overlay.classList.add('active');
      trapFocus(overlay, () => {
        overlay.classList.remove('active');
        if (overlay._trapFocusCleanup) {
          overlay._trapFocusCleanup();
          delete overlay._trapFocusCleanup;
        }
      });
    });
    actions.appendChild(suggestBtn);

    container.appendChild(actions);
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

    // ---- Приём пищи (v4.0): проставляем чекбоксы ----
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

    // ---- Приём пищи (v4.0): собираем массив из отмеченных чекбоксов ----
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
      // При копировании переносим и mealTypes, если они заданы
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

  function showCategorySelection() {
    recTitle.textContent = '🍽️ Выберите категорию';
    recContent.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'rec-category-selection';

    const desc = document.createElement('p');
    desc.textContent = 'Выберите категорию блюд, которые хотите приготовить:';
    desc.className = 'rec-category-desc';
    container.appendChild(desc);

    const categories = [
      { key: CATEGORIES.SOUP,   label: '🍲 Супы' },
      { key: CATEGORIES.SALAD,  label: '🥗 Салаты' },
      { key: CATEGORIES.MAIN,   label: '🍖 Основные блюда' },
      { key: CATEGORIES.BAKERY, label: '🥐 Выпечка' },
      { key: CATEGORIES.OTHER,  label: '🍽️ Другое' }
    ];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-choice-btn';
      btn.textContent = cat.label;
      btn.addEventListener('click', () => showRecommendationsForCategory(cat.key));
      container.appendChild(btn);
    });

    const backBtn = document.createElement('button');
    backBtn.className = 'rec-back-btn';
    backBtn.textContent = '← Назад';
    backBtn.addEventListener('click', returnToChoice);
    container.appendChild(backBtn);

    recContent.appendChild(container);
    recOverlay.classList.add('active');
    trapFocus(recOverlay, closeRecModal);
  }

  function showRecommendationsForCategory(category) {
    recTitle.textContent = `🍽️ Рекомендации: ${CATEGORY_LABELS[category] || category}`;

    const allUnique = DishStore.getAllUniqueWithLastDone();
    const filtered = [];
    allUnique.forEach(item => {
      const dish = DishStore.getAll().find(d => d.name === item.name);
      if (dish && dish.category === category && item.lastDoneDate) {
        if (DishStore.isDishNameDisliked(item.name)) return;
        const liked = DishStore.getAll().some(d => d.name === item.name && d.liked);
        filtered.push({ name: item.name, lastDate: item.lastDoneDate, liked });
      }
    });

    filtered.sort((a, b) => a.lastDate.localeCompare(b.lastDate));
    const likedItems = filtered.filter(item => item.liked);
    const otherItems = filtered.filter(item => !item.liked);
    const likedResult = likedItems.slice(0, 1);
    const othersResult = otherItems.slice(0, 3);

    recContent.innerHTML = '';

    if (likedResult.length === 0 && othersResult.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = `😌 В категории "${CATEGORY_LABELS[category]}" нет блюд, которые вы уже готовили. Добавьте несколько!`;
      recContent.appendChild(empty);
    } else {
      if (likedResult.length > 0) {
        const section = document.createElement('div');
        section.className = 'rec-section';
        const title = document.createElement('h4');
        title.textContent = '👍 Давно не готовили любимое блюдо';
        section.appendChild(title);
        likedResult.forEach(item => {
          section.appendChild(buildRecItem(item));
        });
        recContent.appendChild(section);
      }
      if (othersResult.length > 0) {
        const section = document.createElement('div');
        section.className = 'rec-section';
        const title = document.createElement('h4');
        title.textContent = '🍽️ Другие давние блюда';
        section.appendChild(title);
        othersResult.forEach(item => {
          section.appendChild(buildRecItem(item));
        });
        recContent.appendChild(section);
      }
      const hint = document.createElement('div');
      hint.className = 'rec-hint';
      hint.textContent = '👆 Кликните по блюду, чтобы добавить его в план на завтра';
      recContent.appendChild(hint);
    }

    const backBtn = document.createElement('button');
    backBtn.className = 'rec-back-btn';
    backBtn.textContent = '← Назад к категориям';
    backBtn.addEventListener('click', showCategorySelection);
    recContent.appendChild(backBtn);

    recOverlay.classList.add('active');
    trapFocus(recOverlay, closeRecModal);
  }

  function buildRecItem(item) {
    const row = document.createElement('div');
    row.className = 'rec-item';
    row.dataset.name = item.name;
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Добавить блюдо ${item.name} на завтра`);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'rec-name';
    nameSpan.textContent = item.name;
    row.appendChild(nameSpan);
    const daysSpan = document.createElement('span');
    daysSpan.className = 'rec-days';
    daysSpan.textContent = `последний раз ${Utils.daysAgo(item.lastDate)}`;
    row.appendChild(daysSpan);
    const handleSelect = () => {
      addDishToTomorrow(item.name, null, () => recOverlay.classList.remove('active'));
    };
    row.addEventListener('click', handleSelect);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    });
    return row;
  }

  function openFavorites() {
    recTitle.textContent = '👍 Понравившиеся блюда';
    const favs = DishStore.getFavorites();
    recContent.innerHTML = '';
    if (favs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = '😌 У вас пока нет понравившихся блюд. Отмечайте их пальцем вверх 👍 в модалке дня.';
      recContent.appendChild(empty);
    } else {
      const map = {};
      favs.forEach(d => {
        if (!map[d.name] || d.date > map[d.name]) map[d.name] = { name: d.name, lastDate: d.date, id: d.id };
      });
      const list = Object.values(map);
      list.sort((a, b) => a.lastDate.localeCompare(b.lastDate));
      const section = document.createElement('div');
      section.className = 'rec-section';
      const title = document.createElement('h4');
      title.textContent = 'Все понравившиеся блюда';
      section.appendChild(title);
      list.forEach(item => {
        const row = document.createElement('div');
        row.className = 'rec-item';
        row.dataset.id = item.id;
        row.dataset.name = item.name;
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `Добавить ${item.name} на завтра`);
        const nameSpan = document.createElement('span');
        nameSpan.className = 'rec-name';
        nameSpan.textContent = '👍 ' + item.name;
        row.appendChild(nameSpan);
        const daysSpan = document.createElement('span');
        daysSpan.className = 'rec-days';
        daysSpan.textContent = `последний раз ${Utils.daysAgo(item.lastDate)}`;
        row.appendChild(daysSpan);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'rec-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Убрать оценку';
        removeBtn.setAttribute('aria-label', `Убрать оценку у ${item.name}`);
        row.appendChild(removeBtn);
        const handleAdd = () => {
          addDishToTomorrow(item.name, null, () => recOverlay.classList.remove('active'));
        };
        row.addEventListener('click', function(e) {
          if (e.target === removeBtn) return;
          handleAdd();
        });
        row.addEventListener('keydown', (e) => {
          if (e.target === removeBtn) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleAdd();
          }
        });
        removeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          const id = Number(this.closest('.rec-item').dataset.id);
          const dish = DishStore.getAll().find(d => d.id === id);
          if (dish) {
            DishStore.toggleLike(id);
            openFavorites();
          }
        });
        section.appendChild(row);
      });
      recContent.appendChild(section);
      const hint = document.createElement('div');
      hint.className = 'rec-hint';
      hint.textContent = '👆 Кликните по блюду (кроме крестика), чтобы добавить его в план на завтра. Нажмите ✕, чтобы убрать оценку.';
      recContent.appendChild(hint);
    }

    const backBtn = document.createElement('button');
    backBtn.className = 'rec-back-btn';
    backBtn.textContent = '← Назад';
    backBtn.addEventListener('click', returnToChoice);
    recContent.appendChild(backBtn);

    recOverlay.classList.add('active');
    trapFocus(recOverlay, closeRecModal);
  }

  function closeRecModal() {
    recOverlay.classList.remove('active');
    if (recOverlay._trapFocusCleanup) {
      recOverlay._trapFocusCleanup();
      delete recOverlay._trapFocusCleanup;
    }
  }

  // Возврат из recOverlay в модалку «Что приготовить?».
  function returnToChoice() {
    closeRecModal();
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    if (!overlay) return;
    overlay.classList.add('active');
    trapFocus(overlay, () => {
      overlay.classList.remove('active');
      if (overlay._trapFocusCleanup) {
        overlay._trapFocusCleanup();
        delete overlay._trapFocusCleanup;
      }
    });
  }

  function showTasteCategorySelection() {
    recTitle.textContent = '✨ На твой вкус';
    recContent.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'rec-category-selection';

    const desc = document.createElement('p');
    desc.textContent = 'Выберите категорию — или доверьтесь случаю:';
    desc.className = 'rec-category-desc';
    container.appendChild(desc);

    const allBtn = document.createElement('button');
    allBtn.className = 'category-choice-btn';
    allBtn.textContent = '🎲 Все категории';
    allBtn.addEventListener('click', () => showRandomTasteDish(null));
    container.appendChild(allBtn);

    const categories = [
      { key: CATEGORIES.SOUP,   label: '🍲 Супы' },
      { key: CATEGORIES.SALAD,  label: '🥗 Салаты' },
      { key: CATEGORIES.MAIN,   label: '🍖 Основные блюда' },
      { key: CATEGORIES.BAKERY, label: '🥐 Выпечка' },
      { key: CATEGORIES.OTHER,  label: '🍽️ Другое' }
    ];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-choice-btn';
      btn.textContent = cat.label;
      btn.addEventListener('click', () => showRandomTasteDish(cat.key));
      container.appendChild(btn);
    });

    const backBtn = document.createElement('button');
    backBtn.className = 'rec-back-btn';
    backBtn.textContent = '← Назад';
    backBtn.addEventListener('click', returnToChoice);
    container.appendChild(backBtn);

    recContent.appendChild(container);
    recOverlay.classList.add('active');
    trapFocus(recOverlay, closeRecModal);
  }

  function showRandomTasteDish(category) {
    const random = DishStore.getRandomDishFromTaste(category);
    recTitle.textContent = `✨ ${random.categoryLabel}`;
    recContent.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'rec-section';

    const dishBox = document.createElement('div');
    dishBox.className = 'rec-taste-result';
    dishBox.textContent = random.name;
    section.appendChild(dishBox);

    recContent.appendChild(section);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'rec-taste-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'rec-taste-add';
    addBtn.textContent = '➕ В план на завтра';
    addBtn.addEventListener('click', () => {
      addDishToTomorrow(random.name, null, () => recOverlay.classList.remove('active'));
    });
    actionsRow.appendChild(addBtn);

    const rerollBtn = document.createElement('button');
    rerollBtn.type = 'button';
    rerollBtn.className = 'rec-taste-reroll';
    rerollBtn.textContent = '🔄 Другое блюдо';
    rerollBtn.addEventListener('click', () => showRandomTasteDish(category));
    actionsRow.appendChild(rerollBtn);

    recContent.appendChild(actionsRow);

    const backBtn = document.createElement('button');
    backBtn.className = 'rec-back-btn';
    backBtn.textContent = '← Назад к категориям';
    backBtn.addEventListener('click', showTasteCategorySelection);
    recContent.appendChild(backBtn);
  }

  function openAddModal(dateStr = null) {
    let defaultDate;
    if (dateStr) {
      defaultDate = new Date(dateStr);
    } else {
      defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 1);
    }
    document.getElementById(CONSTANTS.SELECTORS.newDishDate).value = Utils.formatDateLocal(defaultDate);
    document.getElementById(CONSTANTS.SELECTORS.newDishName).value = '';
    document.getElementById(CONSTANTS.SELECTORS.newDishNote).value = '';
    document.getElementById(CONSTANTS.SELECTORS.newDishStatus).value = STATUSES.PLANNED;
    document.getElementById(CONSTANTS.SELECTORS.newDishCategory).value = CATEGORIES.MAIN;

    // ---- Приём пищи (v4.0): сбрасываем все чекбоксы ----
    const addMealTypesGroup = document.getElementById(CONSTANTS.SELECTORS.newDishMealTypesGroup);
    if (addMealTypesGroup) {
      addMealTypesGroup.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    }

    // ---- Заполняем список рецептов (v4.0, добавлено) ----
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

    const overlay = document.getElementById(CONSTANTS.SELECTORS.addModalOverlay);
    overlay.classList.add('active');
    trapFocus(overlay, closeAddModal);
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

    // ---- Поле «Рецепт» в глобальной модалке добавления (v4.0, добавлено) ----
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
    renderCalendar, renderMenu, renderToday, openModal, closeModal, openFavorites,
    closeRecModal, openAddModal, closeAddModal,
    setSearchQuery, setStatusFilter, setCategoryFilter,
    getCurrentDate: () => currentDate,
    getCurrentView: () => currentView,
    setCurrentDate: (d) => { currentDate = d; },
    setCurrentView: (v) => { currentView = v; },
    showRecipeCard,
    showCategorySelection,
    showTasteCategorySelection,
    returnToChoice,
    closeEditDishModal,
    closeRepeatMenuModal
  };
})();
