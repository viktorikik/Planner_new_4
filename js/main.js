import { STATUSES, CONSTANTS } from './utils/Constants.js';
import { Utils } from './utils/Utils.js';
import { EventBus } from './utils/EventBus.js';
import { showMessage } from './utils/notifications.js';
import { trapFocus } from './utils/focusTrap.js';
import { DishStore } from './stores/DishStore.js';
import { RecipeStore } from './stores/RecipeStore.js';
import { Renderer } from './ui/Renderer.js';
import { exportData, importData } from './features/ExportImport.js';
import {
  openRecipesModal,
  closeRecipesModal,
  renderRecipesList,
  closeRecipeForm,
  initRecipesHandlers
} from './features/Recipes.js';
import {
  openShoppingList,
  closeShoppingList,
  initShoppingListHandlers
} from './features/ShoppingList.js';
import { Onboarding } from './features/Onboarding.js';
import { printWeeklyMenu } from './features/Print.js';

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================
(function init() {
  RecipeStore.init();
  DishStore.init();

  // ---------- Bottom navigation + hash routing (v4.0) ----------
  // Табы переключают hash и видимый экран. Контент каждого таба живёт
  // в <div class="tab-view" data-tab-view="..."> внутри .app.
  // Активный таб задаётся атрибутом data-active-tab на .app — CSS
  // показывает только нужный .tab-view.
  const TABS = ['today', 'menu', 'recipes', 'shopping'];
  const DEFAULT_TAB = 'menu';

  function getTabFromHash() {
    const raw = (window.location.hash || '').replace('#', '');
    return TABS.includes(raw) ? raw : DEFAULT_TAB;
  }

  function setActiveTab(tab) {
    // Подсветка кнопок нижней навигации
    const buttons = document.querySelectorAll(CONSTANTS.SELECTORS.bottomNavButtons);
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Переключение видимого экрана
    const app = document.querySelector('.app');
    if (app) app.setAttribute('data-active-tab', tab);

    // При переключении на «Сегодня» — перерисовываем экран
    if (tab === 'today') {
      Renderer.renderToday();
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
      if (window.location.hash === `#${tab}`) return;
      window.location.hash = tab;
    });
  });

  // ---------- Кнопки-заглушки на табах «Рецепты» и «Покупки» ----------
  const goToRecipesFromTab = document.getElementById('goToRecipesFromTab');
  if (goToRecipesFromTab) {
    goToRecipesFromTab.addEventListener('click', function() {
      openRecipesModal();
    });
  }

  const goToShoppingFromTab = document.getElementById('goToShoppingFromTab');
  if (goToShoppingFromTab) {
    goToShoppingFromTab.addEventListener('click', function() {
      openShoppingList();
    });
  }

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

  // ---------- Тема (светлая/тёмная) ----------
  let theme = localStorage.getItem(CONSTANTS.STORAGE_KEYS.THEME);
  if (!theme) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (theme === 'dark') document.body.classList.add('dark-theme');

  document.getElementById(CONSTANTS.SELECTORS.themeToggle).addEventListener('click', function() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem(CONSTANTS.STORAGE_KEYS.THEME, document.body.classList.contains('dark-theme') ? 'dark' : 'light');
  });

  // ---------- Меню «⋯» в шапке ----------
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

  // Клик по любому пункту меню → сначала закрываем меню, потом отработает
  // собственный обработчик пункта (тема / печать / справка).
  moreMenu.querySelectorAll('.more-menu-item').forEach(item => {
    item.addEventListener('click', function() {
      closeMoreMenu();
    });
  });

  // Клик вне меню → закрыть
  document.addEventListener('click', function(e) {
    if (moreMenu.hidden) return;
    if (!moreMenu.contains(e.target) && e.target !== moreMenuBtn) {
      closeMoreMenu();
    }
  });

  // Escape → закрыть меню (если открыто)
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

  // ---------- Drag-and-drop для десктопа (HTML5) ----------
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

  // ---------- Первичная отрисовка календаря ----------
  const now = new Date();
  Renderer.setCurrentDate(now);
  Renderer.setCurrentView('month');
  Renderer.renderCalendar('month', now);

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
    { overlay: document.getElementById(CONSTANTS.SELECTORS.recOverlay), close: Renderer.closeRecModal },
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
    { overlay: document.getElementById(CONSTANTS.SELECTORS.choiceOverlay), close: () => {
        const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
        overlay.classList.remove('active');
        if (overlay._trapFocusCleanup) {
          overlay._trapFocusCleanup();
          delete overlay._trapFocusCleanup;
        }
      }
    },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.welcomeOverlay), close: hideWelcome },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.recipesOverlay), close: closeRecipesModal },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.recipeFormOverlay), close: closeRecipeForm },
    { overlay: document.getElementById(CONSTANTS.SELECTORS.shoppingListOverlay), close: closeShoppingList }
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

  // ---------- History integration для модалок (Android hardware back) ----------
  // Когда открыта модалка — pushState. При закрытии через UI — history.back().
  // Если пользователь нажимает аппаратную «Назад» при открытой модалке —
  // закрываем её, а не переключаем таб. Работает через MutationObserver:
  // следим за .active-классами оверлеев, чтобы не трогать 15 разных мест,
  // где модалки открываются и закрываются.
  let historyEntryPushed = false;
  let closingViaHistory = false;

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
      // Это наш собственный history.back() — просто сброс флагов
      closingViaHistory = false;
      historyEntryPushed = false;
      return;
    }

    if (historyEntryPushed && hasActiveModal()) {
      // Пользователь нажал hardware back. Браузер уже откатил entry,
      // поэтому просто закрываем верхнюю модалку.
      historyEntryPushed = false;
      closeTopActiveModal();
    }
  });

  function closeTopActiveModal() {
    const overlays = document.querySelectorAll(
      '.modal-overlay.active, .choice-overlay.active, .welcome-overlay.active, .onboarding-overlay.active'
    );
    if (overlays.length === 0) return;

    // Находим верхнюю по z-index (последняя в DOM ≠ всегда верхняя)
    let top = overlays[0];
    let topZ = parseInt(getComputedStyle(top).zIndex, 10) || 0;
    for (let i = 1; i < overlays.length; i++) {
      const z = parseInt(getComputedStyle(overlays[i]).zIndex, 10) || 0;
      if (z > topZ) { top = overlays[i]; topZ = z; }
    }

    // Ищем close в массиве modals
    const entry = modals.find(m => m.overlay === top);
    if (entry) {
      entry.close();
      return;
    }

    // Onboarding — особый случай, он не в массиве modals
    if (top.id === CONSTANTS.SELECTORS.onboardingOverlay) {
      Onboarding.close(true);
      return;
    }

    // Динамические оверлеи (например, карточка рецепта) — свой _closeFn
    if (typeof top._closeFn === 'function') {
      top._closeFn();
      return;
    }

    // Fallback: снять класс и почистить trapFocus
    top.classList.remove('active');
    if (top._trapFocusCleanup) {
      top._trapFocusCleanup();
      delete top._trapFocusCleanup;
    }
  }

  // ---------- Глобальный Escape (по массиву modals, без дублирующих if/else) ----------
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;

    const activeModal = document.querySelector(
      '.modal-overlay.active, .choice-overlay.active, .welcome-overlay.active, .onboarding-overlay.active'
    );
    if (!activeModal) return;

    // Тур (onboarding) — особый случай: он не в массиве modals.
    if (activeModal.id === CONSTANTS.SELECTORS.onboardingOverlay) {
      Onboarding.close(true);
      return;
    }

    const found = modals.find(m => m.overlay === activeModal);
    if (found) found.close();
  });

  // ---------- Кнопки закрытия статических модалок ----------
  document.getElementById(CONSTANTS.SELECTORS.modalClose).addEventListener('click', Renderer.closeModal);
  document.getElementById(CONSTANTS.SELECTORS.recClose).addEventListener('click', Renderer.closeRecModal);
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
  document.getElementById(CONSTANTS.SELECTORS.recipesClose).addEventListener('click', closeRecipesModal);
  document.getElementById(CONSTANTS.SELECTORS.recipeFormClose).addEventListener('click', closeRecipeForm);
  document.getElementById(CONSTANTS.SELECTORS.shoppingListClose).addEventListener('click', closeShoppingList);

  // ---------- Модалка "Что приготовить?" ----------
  document.getElementById(CONSTANTS.SELECTORS.suggestBtn).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.add('active');
    trapFocus(overlay, () => {
      overlay.classList.remove('active');
      if (overlay._trapFocusCleanup) {
        overlay._trapFocusCleanup();
        delete overlay._trapFocusCleanup;
      }
    });
  });
  document.getElementById(CONSTANTS.SELECTORS.choiceClose).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
  });
  document.getElementById(CONSTANTS.SELECTORS.choiceFromMenu).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
    Renderer.showCategorySelection();
  });

  // «✨ На твой вкус» — открывает выбор категории
  document.getElementById(CONSTANTS.SELECTORS.choiceFromTaste).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
    Renderer.showTasteCategorySelection();
  });

  // «📖 Из моих рецептов» — открываем модалку рецептов в режиме «из выбора».
  document.getElementById(CONSTANTS.SELECTORS.choiceFromRecipes).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
    openRecipesModal(true);
  });

  document.getElementById(CONSTANTS.SELECTORS.choiceFromFavorites).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
    Renderer.openFavorites();
  });

  // ---------- Кнопки в шапке ----------
  document.getElementById(CONSTANTS.SELECTORS.recipesBtn).addEventListener('click', openRecipesModal);
  document.getElementById(CONSTANTS.SELECTORS.shoppingListBtn).addEventListener('click', openShoppingList);

  // Печать меню на неделю
  document.getElementById('printBtn').addEventListener('click', printWeeklyMenu);

  // ---------- Глобальная модалка добавления блюда ----------
  document.getElementById(CONSTANTS.SELECTORS.addDishBtn).addEventListener('click', Renderer.openAddModal);
  document.getElementById(CONSTANTS.SELECTORS.addModalSave).addEventListener('click', function() {
    const nameInput = document.getElementById(CONSTANTS.SELECTORS.newDishName);
    const noteInput = document.getElementById(CONSTANTS.SELECTORS.newDishNote);
    const dateInput = document.getElementById(CONSTANTS.SELECTORS.newDishDate);
    const statusSelect = document.getElementById(CONSTANTS.SELECTORS.newDishStatus);
    const categorySelect = document.getElementById(CONSTANTS.SELECTORS.newDishCategory);
    const name = nameInput.value.trim();
    if (!name) { showMessage('Введи название блюда', 'error'); return; }
    let date = dateInput.value;
    if (!date) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      date = Utils.formatDateLocal(d);
    }
    const note = noteInput.value.trim();
    DishStore.addDish(name, statusSelect.value, date, categorySelect.value, false, note);
    Renderer.closeAddModal();
    nameInput.value = '';
    noteInput.value = '';
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

  // ---------- Модалка рецептов ----------
  initRecipesHandlers();

  // ---------- Список покупок ----------
  initShoppingListHandlers();

  // ---------- Подписка на изменения рецептов ----------
  EventBus.on(CONSTANTS.EVENTS.RECIPES_CHANGED, () => {
    const recipesOverlay = document.getElementById(CONSTANTS.SELECTORS.recipesOverlay);
    if (recipesOverlay && recipesOverlay.classList.contains('active')) {
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

  // ---------- Service Worker (PWA) ----------
  // Регистрация отложена до события load, чтобы не тормозить первый рендер.
  // Если регистрация не удалась — приложение продолжает работать как раньше,
  // просто без офлайн-доступа и без установки на домашний экран.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./sw.js').catch(function() {
        // Тихо игнорируем — офлайн-режим не критичен для работы приложения.
      });
    });
  }

})();
