import { STATUSES, CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';

export const Renderer = (function() {
  let currentView = 'month';
  let currentDate = new Date();
  let searchQuery = '', statusFilter = 'all', categoryFilter = 'all';
  let currentModalDate = null;

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

  // Единый массив категорий — чтобы не дублировать в трёх местах
  const CATEGORY_OPTIONS = [
    { val: CATEGORIES.SOUP,   label: '🍲 Суп' },
    { val: CATEGORIES.SALAD,  label: '🥗 Салат' },
    { val: CATEGORIES.MAIN,   label: '🍖 Основное' },
    { val: CATEGORIES.BAKERY, label: '🥐 Выпечка' },
    { val: CATEGORIES.OTHER,  label: '🍽️ Другое' }
  ];

  function buildDishElement(dish, dateStr) {
    const dishDiv = document.createElement('div');
    dishDiv.className = `modal-dish ${dish.status}`;
    if (dish.liked) dishDiv.classList.add('liked');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'dish-name';
    
    if (dish.recipeId) {
      const recipeLink = document.createElement('span');
      recipeLink.className = 'recipe-link';
      recipeLink.textContent = '📖';
      recipeLink.title = 'Открыть рецепт';
      recipeLink.setAttribute('aria-label', 'Открыть рецепт');
      recipeLink.addEventListener('click', function(e) {
        e.stopPropagation();
        const recipe = RecipeStore.getById(dish.recipeId);
        if (recipe) {
          showRecipeCard(recipe);
        } else {
          showMessage('Рецепт не найден', 'error');
        }
      });
      nameSpan.appendChild(recipeLink);
    }
    
    const nameText = document.createTextNode(' ' + dish.name);
    nameSpan.appendChild(nameText);
    dishDiv.appendChild(nameSpan);

    const actions = document.createElement('div');
    actions.className = 'dish-actions';

    const statusSpan = document.createElement('span');
    statusSpan.className = 'dish-status';
    statusSpan.textContent = dish.status === STATUSES.DONE ? '✅ Готовила' : '📅 Планирую';
    actions.appendChild(statusSpan);

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Редактировать';
    editBtn.setAttribute('aria-label', 'Редактировать блюдо');
    editBtn.dataset.id = dish.id;
    editBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const id = Number(this.dataset.id);
      const parentDish = this.closest('.modal-dish');
      const nameSpanEl = parentDish.querySelector('.dish-name');
      const currentName = nameSpanEl.textContent.trim();
      const noteDiv = parentDish.querySelector('.dish-note');
      const currentNote = noteDiv ? noteDiv.textContent : '';

      const editContainer = document.createElement('div');
      editContainer.className = 'edit-container';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = currentName;
      nameInput.className = 'edit-input';
      nameInput.placeholder = 'Название';
      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.value = currentNote;
      noteInput.className = 'edit-input note-edit';
      noteInput.placeholder = 'Заметка';
      editContainer.appendChild(nameInput);
      editContainer.appendChild(noteInput);
      nameSpanEl.replaceWith(editContainer);
      if (noteDiv) noteDiv.remove();

      const saveEdit = () => {
        const newName = nameInput.value.trim();
        const newNote = noteInput.value.trim();
        if (newName && newName !== currentName) DishStore.editDishName(id, newName);
        if (newNote !== currentNote) DishStore.updateNote(id, newNote);
      };
      nameInput.addEventListener('blur', saveEdit);
      noteInput.addEventListener('blur', saveEdit);
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
        if (e.key === 'Escape') { nameInput.value = currentName; noteInput.value = currentNote; nameInput.blur(); }
      });
      noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); noteInput.blur(); }
        if (e.key === 'Escape') { nameInput.value = currentName; noteInput.value = currentNote; noteInput.blur(); }
      });
      nameInput.focus();
      nameInput.select();
    });
    actions.appendChild(editBtn);

    const likeBtn = document.createElement('button');
    likeBtn.className = `action-btn like-btn ${dish.liked ? 'liked' : ''}`;
    likeBtn.textContent = dish.liked ? '❤️' : '🤍';
    likeBtn.title = 'Лайк';
    likeBtn.setAttribute('aria-label', dish.liked ? 'Убрать из любимых' : 'Добавить в любимые');
    likeBtn.dataset.id = dish.id;
    likeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      DishStore.toggleLike(Number(this.dataset.id));
    });
    actions.appendChild(likeBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'action-btn toggle-status-btn';
    toggleBtn.textContent = '🔄';
    toggleBtn.title = 'Переключить статус';
    toggleBtn.setAttribute('aria-label', 'Переключить статус блюда');
    toggleBtn.dataset.id = dish.id;
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      DishStore.toggleStatus(Number(this.dataset.id));
    });
    actions.appendChild(toggleBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Удалить';
    deleteBtn.setAttribute('aria-label', 'Удалить блюдо');
    deleteBtn.dataset.id = dish.id;
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('Удалить это блюдо?')) {
        DishStore.removeDish(Number(this.dataset.id));
      }
    });
    actions.appendChild(deleteBtn);

    dishDiv.appendChild(actions);

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
      opt.textContent = val === STATUSES.PLANNED ? '📅 Планирую' : '✅ Готовила';
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

    const recipeSelect = document.createElement('select');
    recipeSelect.id = 'modalNewDishRecipe';
    recipeSelect.className = 'modal-field-select field-half';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Без рецепта';
    recipeSelect.appendChild(defaultOpt);
    const allRecipes = RecipeStore.getAll();
    allRecipes.forEach(r => {
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
            DishStore.addDish(name, STATUSES.PLANNED, dateStr, category, false, '', recipeId);
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
        if (recipe) {
          nameInput.value = recipe.name;
        }
      }
    });

    addBtn.addEventListener('click', function() {
      const name = nameInput.value.trim();
      if (!name) { showMessage('Введи название блюда', 'error'); return; }
      const status = statusSelect.value;
      const category = categorySelect.value;
      const note = document.getElementById('modalNewDishNote').value.trim();
      const recipeId = recipeSelect.value ? Number(recipeSelect.value) : null;
      DishStore.addDish(name, status, dateStr, category, false, note, recipeId);
      nameInput.value = '';
      document.getElementById('modalNewDishNote').value = '';
      recipeSelect.value = '';
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

      // Скрытый текст со статусами для скринридеров
      const statusText = document.createElement('span');
      statusText.className = 'sr-only';
      statusText.textContent = dayDishes.map(d => d.status === STATUSES.DONE ? 'Готовила' : 'Планирую').join(', ');
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

          // Настройка touch-событий для мобильного перетаскивания
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

            longPressTimer = setTimeout(() => {
              activateTouchDrag(e);
            }, 300);
          }, { passive: false });

          const activateTouchDrag = (e) => {
            if (!touchDragData) return;
            touchDragData.chip.classList.add('dragging');
            document.body.style.overflow = 'hidden';
            window.__touchDragActive = true;
            if (longPressTimer) clearTimeout(longPressTimer);
          };

          chip.addEventListener('touchmove', (e) => {
            if (!touchDragData) return;
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - startX);
            const dy = Math.abs(touch.clientY - startY);
            if (!window.__touchDragActive && (dx > 10 || dy > 10)) {
              if (dx > dy && dx > 10) {
                if (longPressTimer) clearTimeout(longPressTimer);
                activateTouchDrag(e);
              } else {
                if (longPressTimer) clearTimeout(longPressTimer);
                touchDragData = null;
                return;
              }
            }

            if (window.__touchDragActive && touchDragData) {
              e.preventDefault();
              const element = document.elementFromPoint(touch.clientX, touch.clientY);
              const targetRow = element ? element.closest('.week-row') : null;
              document.querySelectorAll('.week-row').forEach(r => r.classList.remove('drag-over'));
              if (targetRow) {
                targetRow.classList.add('drag-over');
              }
              touchDragData.targetRow = targetRow;
            }
          }, { passive: false });

          chip.addEventListener('touchend', (e) => {
            if (longPressTimer) clearTimeout(longPressTimer);

            if (window.__touchDragActive && touchDragData) {
              e.preventDefault();
              const targetRow = touchDragData.targetRow;
              if (targetRow && targetRow.dataset.date && targetRow.dataset.date !== touchDragData.fromDate) {
                DishStore.updateDishDate(touchDragData.dishId, targetRow.dataset.date);
                wasTouchDragged = true;
              }
              document.body.style.overflow = '';
              window.__touchDragActive = false;
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
        nameSpan.textContent = dish.name;
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

  function openModal(dateStr) {
    currentModalDate = dateStr;
    const d = new Date(dateStr);
    modalDate.textContent = Utils.formatDate(d);
    const dayDishes = DishStore.getForDate(dateStr);
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
      dayDishes.forEach(dish => {
        section.appendChild(buildDishElement(dish, dateStr));
      });
    }
    modalContent.appendChild(section);

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

  function addDishToTomorrow(name, recipeId = null, closeModalCallback) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = Utils.formatDateLocal(tomorrow);

    let category = null;
    let finalRecipeId = recipeId;

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
    }

    DishStore.addDish(name, STATUSES.PLANNED, dateStr, category, false, '', finalRecipeId);
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
      btn.addEventListener('click', () => {
        showRecommendationsForCategory(cat.key);
      });
      container.appendChild(btn);
    });

    const backBtn = document.createElement('button');
    backBtn.className = 'rec-back-btn';
    backBtn.textContent = '← Назад';
    backBtn.addEventListener('click', () => {
      recOverlay.classList.remove('active');
    });
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
        title.textContent = '❤️ Давно не готовили любимое блюдо';
        section.appendChild(title);
        likedResult.forEach(item => {
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
          section.appendChild(row);
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
          section.appendChild(row);
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
    backBtn.addEventListener('click', () => {
      showCategorySelection();
    });
    recContent.appendChild(backBtn);

    recOverlay.classList.add('active');
    trapFocus(recOverlay, closeRecModal);
  }

  function openFavorites() {
    recTitle.textContent = '❤️ Любимые блюда';
    const favs = DishStore.getFavorites();
    recContent.innerHTML = '';
    if (favs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = '😌 У вас пока нет любимых блюд. Отмечайте блюда сердечком ❤️ в модалке дня.';
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
      title.textContent = 'Все любимые блюда';
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
        nameSpan.textContent = '❤️ ' + item.name;
        row.appendChild(nameSpan);
        const daysSpan = document.createElement('span');
        daysSpan.className = 'rec-days';
        daysSpan.textContent = `последний раз ${Utils.daysAgo(item.lastDate)}`;
        row.appendChild(daysSpan);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'rec-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Убрать из любимых';
        removeBtn.setAttribute('aria-label', `Убрать ${item.name} из любимых`);
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
      hint.textContent = '👆 Кликните по блюду (кроме крестика), чтобы добавить его в план на завтра. Нажмите ✕, чтобы убрать из любимых.';
      recContent.appendChild(hint);
    }
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

  function openAddModal() {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 1);
    document.getElementById(CONSTANTS.SELECTORS.newDishDate).value = Utils.formatDateLocal(defaultDate);
    document.getElementById(CONSTANTS.SELECTORS.newDishName).value = '';
    document.getElementById(CONSTANTS.SELECTORS.newDishNote).value = '';
    document.getElementById(CONSTANTS.SELECTORS.newDishStatus).value = STATUSES.PLANNED;
    document.getElementById(CONSTANTS.SELECTORS.newDishCategory).value = CATEGORIES.MAIN;
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
    modal.classList.add('recipe-view-modal');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.id = 'recipeCardTitle';
    title.textContent = '📖 ' + recipe.name;
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.id = 'recipeCardClose';
    closeButton.textContent = '✕';
    closeButton.setAttribute('aria-label', 'Закрыть');
    header.appendChild(title);
    header.appendChild(closeButton);
    modal.appendChild(header);

    const ingredientsDiv = document.createElement('div');
    ingredientsDiv.classList.add('recipe-ingredients');
    const ingredientsLabel = document.createElement('strong');
    ingredientsLabel.textContent = 'Ингредиенты:';
    ingredientsDiv.appendChild(ingredientsLabel);
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
      instrDiv.className = 'recipe-instructions';
      const instrLabel = document.createElement('strong');
      instrLabel.textContent = 'Инструкция:';
      instrDiv.appendChild(instrLabel);
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
    addButton.textContent = 'Добавить в календарь';
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
      if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
      }
    };
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
    });
    EventBus.on(CONSTANTS.EVENTS.RECIPES_CHANGED, () => {
      const recipesOverlay = document.getElementById(CONSTANTS.SELECTORS.recipesOverlay);
      if (recipesOverlay && recipesOverlay.classList.contains('active')) {
        // renderRecipesList будет вызван из main.js через импорт
        // во избежание циклической зависимости оставляем пустым
      }
    });
  }

  initEventListeners();

  return {
    renderCalendar, renderMenu, openModal, closeModal, openFavorites,
    closeRecModal, openAddModal, closeAddModal,
    setSearchQuery, setStatusFilter, setCategoryFilter,
    getCurrentDate: () => currentDate,
    getCurrentView: () => currentView,
    setCurrentDate: (d) => { currentDate = d; },
    setCurrentView: (v) => { currentView = v; },
    showRecipeCard,
    showCategorySelection,
    showRecommendationsForCategory
  };
})();
