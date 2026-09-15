import { CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { Renderer } from '../ui/Renderer.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';

export function openRecipesModal() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.recipesOverlay);
  overlay.classList.add('active');
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
  const recipes = RecipeStore.getAll();
  list.innerHTML = '';
  if (recipes.length === 0) {
    list.innerHTML = '<div class="modal-empty">😌 У вас пока нет рецептов. Нажмите «Добавить рецепт».</div>';
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
