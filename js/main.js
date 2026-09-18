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

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================
(function init() {
  RecipeStore.init();
  DishStore.init();

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

  // ---------- Глобальный Escape ----------
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active, .choice-overlay.active, .welcome-overlay.active, .onboarding-overlay.active');
      if (activeModal) {
        const id = activeModal.id;
        if (id === CONSTANTS.SELECTORS.modalOverlay) Renderer.closeModal();
        else if (id === CONSTANTS.SELECTORS.recOverlay) Renderer.closeRecModal();
        else if (id === CONSTANTS.SELECTORS.addModalOverlay) Renderer.closeAddModal();
        else if (id === CONSTANTS.SELECTORS.editDishOverlay) Renderer.closeEditDishModal();
        else if (id === CONSTANTS.SELECTORS.repeatMenuOverlay) Renderer.closeRepeatMenuModal();
        else if (id === CONSTANTS.SELECTORS.exportModalOverlay) {
          const overlay = document.getElementById(CONSTANTS.SELECTORS.exportModalOverlay);
          overlay.classList.remove('active');
          if (overlay._trapFocusCleanup) {
            overlay._trapFocusCleanup();
            delete overlay._trapFocusCleanup;
          }
        }
        else if (id === CONSTANTS.SELECTORS.choiceOverlay) {
          const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
          overlay.classList.remove('active');
          if (overlay._trapFocusCleanup) {
            overlay._trapFocusCleanup();
            delete overlay._trapFocusCleanup;
          }
        }
        else if (id === CONSTANTS.SELECTORS.welcomeOverlay) hideWelcome();
        else if (id === CONSTANTS.SELECTORS.recipesOverlay) closeRecipesModal();
        else if (id === CONSTANTS.SELECTORS.recipeFormOverlay) closeRecipeForm();
        else if (id === CONSTANTS.SELECTORS.shoppingListOverlay) closeShoppingList();
        else if (id === CONSTANTS.SELECTORS.onboardingOverlay) Onboarding.close(true);
      }
    }
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
  document.getElementById(CONSTANTS.SELECTORS.choiceFromTaste).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
    const random = DishStore.getRandomDishFromTaste();
    const answer = `🍽️ ${random.categoryLabel}\n\n${random.name}\n\nХотите добавить его в план на завтра?`;
    if (confirm(answer)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = Utils.formatDateLocal(tomorrow);
      DishStore.addDish(random.name, STATUSES.PLANNED, dateStr, random.category, false, '');
      showMessage(`✅ Блюдо "${random.name}" добавлено в план на завтра (${Utils.formatDate(tomorrow)})`);
    }
  });
  document.getElementById(CONSTANTS.SELECTORS.choiceFromRecipes).addEventListener('click', function() {
    const overlay = document.getElementById(CONSTANTS.SELECTORS.choiceOverlay);
    overlay.classList.remove('active');
    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }
    openRecipesModal();
  });

  // ---------- Кнопки в шапке ----------
  document.getElementById(CONSTANTS.SELECTORS.favoritesBtn).addEventListener('click', Renderer.openFavorites);
  document.getElementById(CONSTANTS.SELECTORS.recipesBtn).addEventListener('click', openRecipesModal);
  document.getElementById(CONSTANTS.SELECTORS.shoppingListBtn).addEventListener('click', openShoppingList);

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


})();
