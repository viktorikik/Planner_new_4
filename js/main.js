/**
 * main.js — точка входа приложения.
 *
 * v6.0.0:
 *   • Переход на две темы: light и dark (без classic-/brand-).
 *     Миграция старых значений localStorage → light/dark.
 *     THEMES, DEFAULT_THEME, THEME_LEGACY_MAP больше не импортируются
 *     из Constants.js — определены локально.
 *   • THEME_PREVIEW и buildThemeTiles переписаны под 2 темы.
 *     Акцент — единый лайм #D5E84A в обеих темах.
 *
 * v5.43:
 *   • DEFAULT_TAB = 'today' — приложение открывается на вкладке «Сегодня».
 *   • На «Сегодня» добавлена кнопка «Собрать меню на неделю».
 *
 * v5.44.1:
 *   • Escape теперь закрывает и динамические модалки (карточка рецепта).
 *   • closeTopActiveModal при равных z-index берёт последнюю в DOM.
 *
 * v5.45:
 *   • Обработчик generateMenuBtnToday — через делегирование на document.
 *     Кнопка создаётся динамически в Renderer.renderToday, на момент
 *     инициализации main.js её ещё нет в DOM.
 */
import { STATUSES, CONSTANTS } from './utils/Constants.js';
import { Utils } from './utils/Utils.js';
import { EventBus } from './utils/EventBus.js';
import { showMessage } from './utils/notifications.js';
import { trapFocus } from './utils/focusTrap.js';
import { DishStore } from './stores/DishStore.js';
import { RecipeStore } from './stores/RecipeStore.js';
import {
  Renderer,
  openChoiceScreen,
  closeChoiceModal,
  setChoiceSource,
  setChoiceMealType,
  setChoiceCategory,
  setChoiceOnlyFavorites,
  setChoiceRecipesSource,
  rerollChoiceDish
} from './ui/Renderer.js';
import { exportData, importData } from './features/ExportImport.js';
import {
  openRecipesTab,
  resetOpenedFromChoice,
  renderRecipesList,
  closeRecipeForm,
  initRecipesHandlers
} from './features/Recipes.js';
import {
  initShoppingTab,
  initShoppingListHandlers
} from './features/ShoppingList.js';
import { Onboarding } from './features/Onboarding.js';
import { printWeeklyMenu } from './features/Print.js';
import { MenuGenerator } from './features/MenuGenerator.js';

// ============================================================
// v6.0.0: локальные константы тем (две темы вместо четырёх).
// Значения — строки, которые попадают в data-theme на <html>.
// ============================================================
const THEMES = { LIGHT: 'light', DARK: 'dark' };
const DEFAULT_THEME = THEMES.LIGHT;

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================
(function init() {
  RecipeStore.init();
  DishStore.init();

  // v5.35: Фоновая синхронизация базы рецептов с сервером
  RecipeStore.syncWithServer().then((success) => {
    if (success) {
      if (window.location.hash === '#recipes') {
        renderRecipesList();
      }
    }
  });

  // ---------- Hash routing ----------
  const TABS = ['today', 'menu', 'recipes', 'shopping'];
  // v5.43: приложение открывается на «Сегодня»
  const DEFAULT_TAB = 'today';

  function getTabFromHash() {
    const raw = (window.location.hash || '').replace('#', '');
    return TABS.includes(raw) ? raw : DEFAULT_TAB;
  }

  function highlightBottomNav(tab) {
    const buttons = document.querySelectorAll(CONSTANTS.SELECTORS.bottomNavButtons);
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  function setActiveTab(tab) {
    highlightBottomNav(tab);
    const app = document.querySelector('.app');
    if (app) app.setAttribute('data-active-tab', tab);

    if (tab === 'today') {
      Renderer.resetTodayViewDate();
    } else if (tab === 'recipes') {
      renderRecipesList();
    } else if (tab === 'shopping') {
      initShoppingTab();
    } else {
      resetOpenedFromChoice();
    }
  }

  function handleHashChange() {
    setActiveTab(getTabFromHash());
  }

  if (!window.location.hash) {
    window.location.hash = DEFAULT_TAB;
  } else {
    handleHashChange();
  }

  window.addEventListener('hashchange', handleHashChange);

  document.querySelectorAll(CONSTANTS.SELECTORS.bottomNavButtons).forEach(btn => {
    btn.addEventListener('click', function() {
      const tab = this.dataset.tab;
      if (window.location.hash === `#${tab}`) {
        if (tab === 'today') Renderer.resetTodayViewDate();
        return;
      }
      window.location.hash = tab;
    });
  });

  // ---------- Приветственное окно ----------
  function showWelcome() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.welcomeOverlay);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    trapFocus(overlay, hideWelcome);
  }
  function hideWelcome() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.welcomeOverlay);
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  }

  Onboarding.init();

  if (Onboarding.shouldShow()) {
    setTimeout(showWelcome, 300);
  }

  document.getElementById(CONSTANTS.SELECTORS.welcomeStartBtn).addEventListener('click', function() {
    hideWelcome();
    Onboarding.open();
  });

  // ---------- Тема (v6.0.0: light/dark) ----------
  function getStoredTheme() {
    let raw;
    try {
      raw = localStorage.getItem(CONSTANTS.STORAGE_KEYS.THEME);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    // Одноразовая миграция старых значений в light/dark.
    const LEGACY_MAP = {
      'classic-light': THEMES.LIGHT,
      'brand-light':   THEMES.LIGHT,
      'classic-dark':  THEMES.DARK,
      'brand-dark':    THEMES.DARK
    };

    if (LEGACY_MAP[raw]) {
      const migrated = LEGACY_MAP[raw];
      try {
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.THEME, migrated);
      } catch (e) { /* молча */ }
      return migrated;
    }

    if (raw === THEMES.LIGHT || raw === THEMES.DARK) return raw;
    return null;
  }

  function getPreferredTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? THEMES.DARK
      : THEMES.LIGHT;
  }

  function applyTheme(theme) {
    const valid = (theme === THEMES.LIGHT || theme === THEMES.DARK) ? theme : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', valid);
  }

  let currentTheme = getStoredTheme() || getPreferredTheme() || DEFAULT_THEME;
  applyTheme(currentTheme);

  const THEME_PREVIEW = {
    [THEMES.LIGHT]: { bg: '#F6F4ED', accent: '#D5E84A', accentText: '#25251F', label: 'Светлая' },
    [THEMES.DARK]:  { bg: '#201F1C', accent: '#D5E84A', accentText: '#25251F', label: 'Тёмная' }
  };

  const themeOverlay = document.getElementById(CONSTANTS.SELECTORS.themeOverlay);
  const themeGrid = document.getElementById(CONSTANTS.SELECTORS.themeGrid);

  function highlightCurrentTheme() {
    if (!themeGrid) return;
    themeGrid.querySelectorAll('.theme-option').forEach(tile => {
      const isActive = tile.dataset.theme === currentTheme;
      tile.classList.toggle('active', isActive);
      tile.setAttribute('aria-pressed', String(isActive));
    });
  }

  function buildThemeTiles() {
    if (!themeGrid) return;
    themeGrid.innerHTML = '';

    Object.keys(THEMES).forEach(key => {
      const theme = THEMES[key];
      const preview = THEME_PREVIEW[theme];
      if (!preview) return;

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'theme-option';
      tile.dataset.theme = theme;
      tile.setAttribute('aria-label', 'Тема: ' + preview.label);
      tile.setAttribute('aria-pressed', 'false');

      const previewEl = document.createElement('span');
      previewEl.className = 'theme-option-preview';
      previewEl.style.background = preview.bg;

      const chipEl = document.createElement('span');
      chipEl.className = 'theme-option-chip';
      chipEl.style.background = preview.accent;
      chipEl.style.color = preview.accentText;
      chipEl.textContent = 'Aa';
      previewEl.appendChild(chipEl);

      tile.appendChild(previewEl);

      const labelEl = document.createElement('span');
      labelEl.className = 'theme-option-label';
      labelEl.textContent = preview.label;
      tile.appendChild(labelEl);

      const checkEl = document.createElement('span');
      checkEl.className = 'theme-option-check';
      checkEl.setAttribute('aria-hidden', 'true');
      checkEl.textContent = '✓';
      tile.appendChild(checkEl);

      tile.addEventListener('click', () => {
        currentTheme = theme;
        applyTheme(theme);
        try {
          localStorage.setItem(CONSTANTS.STORAGE_KEYS.THEME, theme);
        } catch (e) { /* молча */ }
        highlightCurrentTheme();
      });

      themeGrid.appendChild(tile);
    });

    highlightCurrentTheme();
  }

  function openThemeModal() {
    if (!themeOverlay) return;
    highlightCurrentTheme();
    themeOverlay.classList.add('active');
    trapFocus(themeOverlay, closeThemeModal);
  }

  function closeThemeModal() {
    if (!themeOverlay) return;
    themeOverlay.classList.remove('active');
    if (themeOverlay._trapFocusCleanup) {
      themeOverlay._trapFocusCleanup();
      delete themeOverlay._trapFocusCleanup;
    }
  }

  buildThemeTiles();

  document.getElementById(CONSTANTS.SELECTORS.themeToggle).addEventListener('click', openThemeModal);

  if (themeOverlay) {
    document.getElementById(CONSTANTS.SELECTORS.themeClose).addEventListener('click', closeThemeModal);
  }

  // ---------- Меню «⋯» ----------
  const moreMenuBtn = document.getElementById('moreMenuBtn');
  const moreMenu = document.getElementById('moreMenu');

  function openMoreMenu() {
    moreMenu.hidden = false;
    moreMenuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMoreMenu() {
    moreMenu.hidden = true;
    moreMenuBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleMoreMenu() {
    if (moreMenu.hidden) openMoreMenu();
    else closeMoreMenu();
  }

  moreMenuBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleMoreMenu();
  });

  moreMenu.querySelectorAll('.more-menu-item').forEach(item => {
    item.addEventListener('click', function() {
      closeMoreMenu();
    });
  });

  document.addEventListener('click', function(e) {
    if (moreMenu.hidden) return;
    if (!moreMenu.contains(e.target) && e.target !== moreMenuBtn) {
      closeMoreMenu();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !moreMenu.hidden) {
      closeMoreMenu();
    }
  });

  // ---------- Поиск и фильтры ----------
  const searchInput = document.getElementById(CONSTANTS.SELECTORS.searchInput);
  const debouncedSetSearchQuery = Utils.debounce(function() {
    Renderer.setSearchQuery(this.value);
  }, 300);
  searchInput.addEventListener('input', debouncedSetSearchQuery);

  document.getElementById(CONSTANTS.SELECTORS.statusFilter).addEventListener('change', function() {
    Renderer.setStatusFilter(this.value);
  });
  document.getElementById(CONSTANTS.SELECTORS.categoryFilter).addEventListener('change', function() {
    Renderer.setCategoryFilter(this.value);
  });

  // ---------- Drag-and-drop ----------
  let draggedDishId = null, draggedFromDate = null;
  document.addEventListener('dragstart', function(e) {
    const target = e.target.closest('.meal-chip');
    if (!target) return;
    draggedDishId = Number(target.dataset.id);
    draggedFromDate = target.dataset.date;
    target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(draggedDishId));
  });
  document.addEventListener('dragend', function(e) {
    const target = e.target.closest('.meal-chip');
    if (target) target.classList.remove('dragging');
    document.querySelectorAll('.week-row.drag-over').forEach(row => row.classList.remove('drag-over'));
  });
  document.addEventListener('dragover', function(e) {
    const row = e.target.closest('.week-row');
    if (!row) return;
    e.preventDefault();
    row.classList.add('drag-over');
  });
  document.addEventListener('dragleave', function(e) {
    const row = e.target.closest('.week-row');
    if (row) row.classList.remove('drag-over');
  });
  document.addEventListener('drop', function(e) {
    const row = e.target.closest('.week-row');
    if (!row) return;
    e.preventDefault();
    row.classList.remove('drag-over');
    const targetDate = row.dataset.date;
    if (!targetDate || !draggedDishId || draggedFromDate === targetDate) {
      draggedDishId = null; draggedFromDate = null;
      return;
    }
    DishStore.updateDishDate(draggedDishId, targetDate);
    draggedDishId = null; draggedFromDate = null;
  });

  // ---------- АВТОСБОРЩИК МЕНЮ ----------
  const generateMenuOverlay = document.getElementById('generateMenuOverlay');
  const generateFridgeMode = document.getElementById('generateFridgeMode');
  const fridgeIngredientsWrap = document.getElementById('fridgeIngredientsWrap');

  if (generateFridgeMode) {
    generateFridgeMode.addEventListener('change', function() {
      fridgeIngredientsWrap.hidden = !this.checked;
      if (this.checked) {
        document.getElementById('generateFridgeInput').focus();
      }
    });
  }

  function openGenerateModal() {
    if (!generateMenuOverlay) return;
    generateMenuOverlay.classList.add('active');
    trapFocus(generateMenuOverlay, closeGenerateModal);
  }

  function closeGenerateModal() {
    if (!generateMenuOverlay) return;
    generateMenuOverlay.classList.remove('active');
    if (generateMenuOverlay._trapFocusCleanup) {
      generateMenuOverlay._trapFocusCleanup();
      delete generateMenuOverlay._trapFocusCleanup;
    }
  }

  // Кнопка в шапке календаря — статическая, можно вешать напрямую
  document.getElementById('generateMenuBtn').addEventListener('click', openGenerateModal);

  // v5.45: кнопка на «Сегодня» создаётся динамически в Renderer.renderToday.
  // Вешаем через делегирование — на момент init её может ещё не быть в DOM,
  // а после перерисовок она пересоздаётся. Делегирование решает оба случая.
  document.addEventListener('click', function(e) {
    if (e.target.closest('#generateMenuBtnToday')) {
      openGenerateModal();
    }
  });

  document.getElementById('generateMenuClose').addEventListener('click', closeGenerateModal);
  document.getElementById('generateMenuCancel').addEventListener('click', closeGenerateModal);

  document.getElementById('generateMenuSave').addEventListener('click', function() {
    const days = parseInt(document.getElementById('generateDaysCount').value, 10);
    const maxTime = parseInt(document.getElementById('generateMaxTime').value, 10);
    const isFridgeMode = generateFridgeMode.checked;
    const fridgeInput = document.getElementById('generateFridgeInput').value;
    const fridgeIngredients = isFridgeMode && fridgeInput ? fridgeInput.split(',').map(s => s.trim()).filter(Boolean) : [];

    const mealTypes = [];
    document.querySelectorAll('input[data-gen-meal]:checked').forEach(cb => {
      mealTypes.push(cb.dataset.genMeal);
    });

    if (mealTypes.length === 0) {
      showMessage('Выберите хотя бы один приём пищи', 'error');
      return;
    }

    // Блокируем кнопку на время сборки
    const saveBtn = this;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Собираем...';
    saveBtn.disabled = true;

    setTimeout(() => {
      const startDate = Utils.formatDateLocal(new Date());
      const result = MenuGenerator.generateMenu({
        startDate,
        days,
        mealTypes,
        fridgeIngredients,
        maxWeekdayTime: maxTime
      });

      if (result.success) {
        const dishesToSave = [];
        Object.keys(result.menu).forEach(dateStr => {
          Object.keys(result.menu[dateStr]).forEach(mealType => {
            const dish = result.menu[dateStr][mealType];
            dishesToSave.push({
              name: dish.name,
              date: dateStr,
              mealType: mealType,
              category: dish.category || Utils.guessCategory(dish.name),
              recipeId: dish.id
            });
          });
        });

        // Группируем по датам и удаляем старые (чтобы не дублировалось)
        const uniqueDates = [...new Set(dishesToSave.map(d => d.date))];
        uniqueDates.forEach(date => {
            const existing = DishStore.getForDate(date);
            existing.forEach(d => DishStore.removeDish(d.id));
        });

        DishStore.addMultipleDishes(dishesToSave.map(d => ({
           name: d.name,
           date: d.date,
           category: d.category,
           recipeId: d.recipeId,
           mealTypes: [d.mealType]
        })));

        showMessage(`✨ Меню на ${days} дней успешно собрано!`);
        closeGenerateModal();
        Renderer.renderCalendar(Renderer.getCurrentView(), Renderer.getCurrentDate());
      } else {
        showMessage(result.message || 'Не удалось собрать меню', 'error');
      }

      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 50);
  });

  // Обработчик замены блюда (Reroll)
  Renderer.replaceDishHandler = function(dishId) {
    const dish = DishStore.getAll().find(d => d.id === dishId);
    if (!dish) return;

    const dateStr = dish.date;
    const mealType = (dish.mealTypes && dish.mealTypes.length > 0) ? dish.mealTypes[0] : 'dinner';

    // Собираем контекст текущего меню на неделю
    const currentMenu = {};
    DishStore.getAll().forEach(d => {
      if (!currentMenu[d.date]) currentMenu[d.date] = {};
      const mt = (d.mealTypes && d.mealTypes.length > 0) ? d.mealTypes[0] : 'dinner';
      currentMenu[d.date][mt] = { id: d.id, name: d.name, tags: d.tags || {} };
    });

    const newDish = MenuGenerator.getReplacement(
      dish.recipeId || dish.id,
      dateStr,
      mealType,
      currentMenu,
      { maxWeekdayTime: 40 }
    );

    if (newDish) {
      DishStore.updateDish(dishId, {
        name: newDish.name,
        recipeId: newDish.id,
        category: newDish.category || Utils.guessCategory(newDish.name)
      });
      showMessage(`🎲 Заменено на "${newDish.name}"`);

      const modalOverlay = document.getElementById(CONSTANTS.SELECTORS.modalOverlay);
      if (modalOverlay && modalOverlay.classList.contains('active')) {
        Renderer.openModal(dateStr);
      }
    } else {
      showMessage('Не удалось подобрать замену', 'error');
    }
  };
  // ---------- КОНЕЦ АВТОСБОРЩИКА ----------

  // ---------- Первичная отрисовка ----------
  const now = new Date();
  Renderer.setCurrentDate(now);
  Renderer.setCurrentView('week');
  Renderer.renderCalendar('week', now);

  // ---------- Навигация по календарю ----------
  document.getElementById(CONSTANTS.SELECTORS.prevMonth).addEventListener('click', function() {
    const curDate = Renderer.getCurrentDate();
    const view = Renderer.getCurrentView();
    const newDate = new Date(curDate);
    if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
    else newDate.setDate(newDate.getDate() - 7);
    Renderer.setCurrentDate(newDate);
    Renderer.renderCalendar(view, newDate);
  });

  document.getElementById(CONSTANTS.SELECTORS.nextMonth).addEventListener('click', function() {
    const curDate = Renderer.getCurrentDate();
    const view = Renderer.getCurrentView();
    const newDate = new Date(curDate);
    if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
    else newDate.setDate(newDate.getDate() + 7);
    Renderer.setCurrentDate(newDate);
    Renderer.renderCalendar(view, newDate);
  });

  document.getElementById(CONSTANTS.SELECTORS.todayBtn).addEventListener('click', function() {
    const now = new Date();
    const view = Renderer.getCurrentView();
    Renderer.setCurrentDate(now);
    Renderer.renderCalendar(view, now);
  });

  document.querySelectorAll(CONSTANTS.SELECTORS.viewToggleButtons).forEach(btn => {
    btn.addEventListener('click', function() {
      const view = this.dataset.view;
      Renderer.setCurrentView(view);
      const curDate = Renderer.getCurrentDate();
      Renderer.renderCalendar(view, curDate);
    });
  });

  // ---------- Универсальное закрытие модалок ----------
  const modals = [
    { overlay: document.getElementById(CONSTANTS.SELECTORS.modalOverlay), close: Renderer.closeModal },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.addModalOverlay), close: Renderer.closeAddModal },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.editDishOverlay), close: Renderer.closeEditDishModal },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.repeatMenuOverlay), close: Renderer.closeRepeatMenuModal },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.exportModalOverlay), close: () => {
        const overlay = document.getElementById(CONSTANTS.SELECTORS.exportModalOverlay);
        overlay.classList.remove('active');
        if (overlay._trapFocusCleanup) {
          overlay._trapFocusCleanup();
          delete overlay._trapFocusCleanup;
        }
      }
    },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.choiceOverlay), close: closeChoiceModal },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.welcomeOverlay), close: hideWelcome },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.recipeFormOverlay), close: closeRecipeForm },
    { overlay: themeOverlay, close: closeThemeModal },
    { overlay: generateMenuOverlay, close: closeGenerateModal }
  ];

  modals.forEach(({ overlay, close }) => {
    if (!overlay) return;
    overlay.addEventListener('click', function(e) {
      if (e.target === this) close();
    });
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') close();
    });
  });

  // ---------- History integration для модалок ----------
  let historyEntryPushed = false;
  let closingViaHistory = false;
  let pendingTabAfterModalClose = null;

  function hasActiveModal() {
    return !!document.querySelector(
      '.modal-overlay.active, .choice-overlay.active, .welcome-overlay.active, .onboarding-overlay.active'
    );
  }

  function syncModalHistory() {
    const hasModal = hasActiveModal();
    if (hasModal && !historyEntryPushed) {
      history.pushState({ modal: true }, '');
      historyEntryPushed = true;
    } else if (!hasModal && historyEntryPushed && !closingViaHistory) {
      closingViaHistory = true;
      history.back();
    }
  }

  const modalObserver = new MutationObserver(syncModalHistory);
  modalObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('popstate', function() {
    if (closingViaHistory) {
      closingViaHistory = false;
      historyEntryPushed = false;
      if (pendingTabAfterModalClose) {
        const tab = pendingTabAfterModalClose;
        pendingTabAfterModalClose = null;
        window.location.hash = tab;
      }
      return;
    }

    if (historyEntryPushed && hasActiveModal()) {
      historyEntryPushed = false;
      closeTopActiveModal();
    }
  });

  function closeTopActiveModal() {
    const overlays = document.querySelectorAll(
      '.modal-overlay.active, .choice-overlay.active, .welcome-overlay.active, .onboarding-overlay.active'
    );
    if (overlays.length === 0) return;

    // v5.44.1: при равных z-index берём последнюю в DOM (визуально сверху).
    let top = overlays[0];
    let topZ = parseInt(getComputedStyle(top).zIndex, 10) || 0;
    for (let i = 1; i < overlays.length; i++) {
      const z = parseInt(getComputedStyle(overlays[i]).zIndex, 10) || 0;
      if (z >= topZ) { top = overlays[i]; topZ = z; }
    }

    const entry = modals.find(m => m.overlay === top);
    if (entry) {
      entry.close();
      return;
    }

    if (top.id === CONSTANTS.SELECTORS.onboardingOverlay) {
      Onboarding.close(true);
      return;
    }

    if (typeof top._closeFn === 'function') {
      top._closeFn();
      return;
    }

    top.classList.remove('active');
    if (top._trapFocusCleanup) {
      top._trapFocusCleanup();
      delete top._trapFocusCleanup;
    }
  }

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const activeModal = document.querySelector(
      '.modal-overlay.active, .choice-overlay.active, .welcome-overlay.active, .onboarding-overlay.active'
    );
    if (!activeModal) return;
    if (activeModal.id === CONSTANTS.SELECTORS.onboardingOverlay) {
      Onboarding.close(true);
      return;
    }
    const found = modals.find(m => m.overlay === activeModal);
    if (found) {
      found.close();
      return;
    }
    // v5.44.1: fallback для динамических модалок (карточка рецепта).
    closeTopActiveModal();
  });

  // ---------- Кнопки закрытия статических модалок ----------
  document.getElementById(CONSTANTS.SELECTORS.modalClose).addEventListener('click', Renderer.closeModal);
  document.getElementById(CONSTANTS.SELECTORS.addModalClose).addEventListener('click', Renderer.closeAddModal);
  document.getElementById(CONSTANTS.SELECTORS.addModalCancel).addEventListener('click', Renderer.closeAddModal);
  document.getElementById(CONSTANTS.SELECTORS.exportModalClose).addEventListener('click', () => {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.exportModalOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  });
  document.getElementById(CONSTANTS.SELECTORS.recipeFormClose).addEventListener('click', closeRecipeForm);

  // ---------- Экран «Что приготовить?» ----------
  document.getElementById(CONSTANTS.SELECTORS.choiceClose).addEventListener('click', closeChoiceModal);

  const choiceSourceButtons = document.querySelectorAll('#choiceSourceGroup .choice-source-btn');
  choiceSourceButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const source = this.dataset.source || 'menu';
      setChoiceSource(source);
    });
  });

  const choiceChips = document.querySelectorAll('#choiceMealTypesChips .choice-chip');
  choiceChips.forEach(chip => {
    chip.addEventListener('click', function() {
      const type = this.dataset.mealType || '';
      setChoiceMealType(type);
    });
  });

  const choiceRecipesSourceChips = document.querySelectorAll('#choiceRecipesSourceChips .choice-chip');
  choiceRecipesSourceChips.forEach(chip => {
    chip.addEventListener('click', function() {
      const src = this.dataset.recipesSource || 'all';
      setChoiceRecipesSource(src);
    });
  });

  const choiceCategorySelect = document.getElementById('choiceCategorySelect');
  if (choiceCategorySelect) {
    choiceCategorySelect.addEventListener('change', function() {
      setChoiceCategory(this.value);
    });
  }

  const choiceFavCb = document.getElementById('choiceOnlyFavorites');
  if (choiceFavCb) {
    choiceFavCb.addEventListener('change', function() {
      setChoiceOnlyFavorites(this.checked);
    });
  }

  const choiceRerollBtn = document.getElementById('choiceRerollBtn');
  if (choiceRerollBtn) {
    choiceRerollBtn.addEventListener('click', function() {
      rerollChoiceDish();
    });
  }

  const choiceOpenRecipesBtn = document.getElementById('choiceOpenRecipesBtn');
  if (choiceOpenRecipesBtn) {
    choiceOpenRecipesBtn.addEventListener('click', function() {
      openRecipesTab(true);
      if (historyEntryPushed) {
        pendingTabAfterModalClose = 'recipes';
        closeChoiceModal();
      } else {
        closeChoiceModal();
        window.location.hash = 'recipes';
      }
    });
  }

  // ---------- Печать ----------
  document.getElementById('printBtn').addEventListener('click', printWeeklyMenu);

  // ---------- Глобальная модалка добавления блюда ----------
  document.getElementById(CONSTANTS.SELECTORS.addModalSave).addEventListener('click', function() {
    const nameInput = document.getElementById(CONSTANTS.SELECTORS.newDishName);
    const noteInput = document.getElementById(CONSTANTS.SELECTORS.newDishNote);
    const dateInput = document.getElementById(CONSTANTS.SELECTORS.newDishDate);
    const statusSelect = document.getElementById(CONSTANTS.SELECTORS.newDishStatus);
    const categorySelect = document.getElementById(CONSTANTS.SELECTORS.newDishCategory);
    const mealTypesGroup = document.getElementById(CONSTANTS.SELECTORS.newDishMealTypesGroup);
    const recipeSelect = document.getElementById(CONSTANTS.SELECTORS.newDishRecipe);
    const name = nameInput.value.trim();
    if (!name) { showMessage('Введи название блюда', 'error'); return; }
    let date = dateInput.value;
    if (!date) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      date = Utils.formatDateLocal(d);
    }
    const note = noteInput.value.trim();
    let mealTypes = [];
    if (mealTypesGroup) {
      const checkedBoxes = mealTypesGroup.querySelectorAll('input[type=checkbox]:checked');
      mealTypes = Array.from(checkedBoxes).map(cb => cb.dataset.mealType);
    }
    const recipeValue = recipeSelect ? recipeSelect.value : '';
    const recipeId = recipeValue ? recipeValue : null;
    DishStore.addDish(name, statusSelect.value, date, categorySelect.value, false, note, recipeId, mealTypes);
    Renderer.closeAddModal();
    nameInput.value = '';
    noteInput.value = '';
    if (mealTypesGroup) {
      mealTypesGroup.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    }
    if (recipeSelect) recipeSelect.value = '';
  });

  // ---------- Экспорт данных ----------
  document.getElementById(CONSTANTS.SELECTORS.exportBtn).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.exportModalOverlay);
    overlay.classList.add('active');
    trapFocus(overlay, () => {
      overlay.classList.remove('active');
      if (overlay._trapFocusCleanup) {
        overlay._trapFocusCleanup();
        delete overlay._trapFocusCleanup;
      }
    });
  });
  document.querySelectorAll(CONSTANTS.SELECTORS.exportOptions).forEach(btn => {
    btn.addEventListener('click', function() {
      const format = this.dataset.format;
      const overlay = document.getElementById(CONSTANTS.SELECTORS.exportModalOverlay);
      overlay.classList.remove('active');
      if (overlay._trapFocusCleanup) {
        overlay._trapFocusCleanup();
        delete overlay._trapFocusCleanup;
      }
      exportData(format);
    });
  });

  // ---------- Импорт данных ----------
  document.getElementById(CONSTANTS.SELECTORS.importBtn).addEventListener('click', function() {
    document.getElementById(CONSTANTS.SELECTORS.importFileInput).click();
  });
  document.getElementById(CONSTANTS.SELECTORS.importFileInput).addEventListener('change', function(e) {
    if (this.files && this.files.length > 0) {
      importData(this.files[0]);
      this.value = '';
    }
  });

  // ---------- Обработчики табов ----------
  initRecipesHandlers();
  initShoppingListHandlers();

  // ---------- Подписка на изменения рецептов ----------
  EventBus.on(CONSTANTS.EVENTS.RECIPES_CHANGED, () => {
    const app = document.querySelector('.app');
    if (app && app.getAttribute('data-active-tab') === 'recipes') {
      renderRecipesList();
    }
  });

  // ---------- Свайпы для календаря ----------
  let touchStartX = 0, touchStartY = 0;
  const wrap = document.getElementById(CONSTANTS.SELECTORS.calendarWrap);

  wrap.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
  }, { passive: true });

  wrap.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const touchEndX = touch.screenX;
    const touchEndY = touch.screenY;
    const dx = touchStartX - touchEndX;
    const dy = touchStartY - touchEndY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      const target = e.target;
      if (target.closest('.meal-chip')) return;
      const curDate = Renderer.getCurrentDate();
      const view = Renderer.getCurrentView();
      const newDate = new Date(curDate);
      if (view === 'month') newDate.setMonth(newDate.getMonth() + (dx > 0 ? 1 : -1));
      else newDate.setDate(newDate.getDate() + (dx > 0 ? 7 : -7));
      Renderer.setCurrentDate(newDate);
      Renderer.renderCalendar(view, newDate);
    }
  }, { passive: true });

  // ---------- Свайпы для экрана «Сегодня» ----------
  const todayWrap = document.getElementById(CONSTANTS.SELECTORS.todayContent);
  if (todayWrap) {
    let todayTouchStartX = 0;
    let todayTouchStartY = 0;
    let todaySwipeStartedOnCard = false;

    todayWrap.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      todayTouchStartX = t.screenX;
      todayTouchStartY = t.screenY;
      todaySwipeStartedOnCard = !!e.target.closest('.dish-swipe-wrap');
    }, { passive: true });

    todayWrap.addEventListener('touchend', (e) => {
      if (todaySwipeStartedOnCard) return;
      const t = e.changedTouches[0];
      const dx = todayTouchStartX - t.screenX;
      const dy = todayTouchStartY - t.screenY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        Renderer.shiftTodayViewDate(dx > 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', function() {
      navigator.serviceWorker
        .register('./sw.js', { updateViaCache: 'none' })
        .then(function(reg) { return reg.update(); })
        .catch(function() {});
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

})();
