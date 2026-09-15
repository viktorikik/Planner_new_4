import { CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';

// ============================================================
// КАТЕГОРИИ ПРОДУКТОВ (отделы магазина)
// ============================================================
const DEPARTMENTS = {
  'Овощи': ['лук', 'морковь', 'картофель', 'капуста', 'свекла', 'редис', 'репа', 'огурец', 'помидор', 'перец', 'баклажан', 'кабачок', 'тыква', 'чеснок', 'зелень', 'петрушка', 'укроп', 'базилик', 'кинза', 'салат', 'шпинат', 'щавель', 'ревень', 'сельдерей'],
  'Фрукты, ягоды': ['яблоко', 'груша', 'айва', 'хурма', 'гранат', 'лимон', 'лайм', 'грейпфрут', 'мандарин', 'апельсин', 'клубника', 'малина', 'черника', 'ежевика', 'смородина', 'крыжовник', 'вишня', 'черешня', 'слива', 'абрикос', 'персик', 'нектарин', 'банан', 'киви', 'манго', 'ананас', 'арбуз', 'дыня', 'финик', 'инжир', 'курага', 'чернослив', 'изюм'],
  'Мясо, птица': ['говядина', 'свинина', 'баранина', 'телятина', 'курица', 'индейка', 'утка', 'гусь', 'кролик', 'фарш', 'печень', 'сердце', 'почки'],
  'Рыба, морепродукты': ['тунец', 'горбуша', 'лосось', 'форель', 'сёмга', 'кета', 'кижуч', 'треска', 'пикша', 'окунь', 'судак', 'щука', 'сом', 'налим', 'осётр', 'пангасиус', 'тилапия', 'дорада', 'сибас', 'ставрида', 'скумбрия', 'макрель', 'сельдь', 'шпроты', 'килька', 'креветки', 'мидии', 'кальмары', 'краб'],
  'Молочные продукты, яйца': ['молоко', 'сливки', 'сметана', 'йогурт', 'кефир', 'ряженка', 'творог', 'сыр', 'масло', 'маргарин', 'майонез', 'кетчуп', 'яйцо'],
  'Бакалея, крупы, макароны': ['рис', 'гречка', 'овсянка', 'перловка', 'пшено', 'кускус', 'булгур', 'макароны', 'паста', 'лапша', 'вермишель', 'спагетти', 'мука', 'сахар', 'дрожжи', 'разрыхлитель', 'сода'],
  'Специи, приправы': ['соль', 'перец', 'корица', 'ваниль', 'какао', 'шоколад', 'орегано', 'тимьян', 'розмарин', 'кориандр', 'тмин', 'кумин', 'паприка', 'куркума', 'имбирь', 'шафран', 'гвоздика', 'кардамон'],
  'Жиры, масла': ['оливковое масло', 'подсолнечное масло', 'сливочное масло'],
  'Напитки, жидкости': ['вода', 'бульон', 'вино', 'коньяк', 'ром', 'пиво', 'чай', 'кофе', 'компот', 'кисель', 'морс', 'квас', 'лимонад', 'сок', 'нектар'],
  'Грибы': ['гриб', 'шампиньон', 'белый гриб', 'подберёзовик', 'лисичка'],
  'Заготовки, сладости': ['варенье', 'джем', 'конфитюр', 'мёд', 'сироп', 'пастила', 'мармелад'],
  'Орехи, сухофрукты': ['орех', 'миндаль', 'фисташка', 'кешью', 'грецкий орех', 'фундук']
};

function classifyIngredient(ingredient) {
  const lower = ingredient.toLowerCase();
  for (const [department, keywords] of Object.entries(DEPARTMENTS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return department;
    }
  }
  return 'Прочее';
}

// ============================================================
// РАБОТА С СОХРАНЁННЫМИ СПИСКАМИ
// ============================================================
function getSavedShoppingListKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('shoppingList_')) {
      keys.push(key);
    }
  }
  return keys.sort();
}

// ============================================================
// ОТКРЫТИЕ / ЗАКРЫТИЕ МОДАЛКИ
// ============================================================
export function openShoppingList() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.shoppingListOverlay);
  overlay.classList.add('active');
  document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay).style.display = 'none';
  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'block';
  renderSavedLists();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById(CONSTANTS.SELECTORS.shoppingDateFrom).value = Utils.formatDateLocal(today);
  document.getElementById(CONSTANTS.SELECTORS.shoppingDateTo).value = Utils.formatDateLocal(tomorrow);
  trapFocus(overlay, closeShoppingList);
}

export function closeShoppingList() {
  const overlay = document.getElementById(CONSTANTS.SELECTORS.shoppingListOverlay);
  overlay.classList.remove('active');
  if (overlay._trapFocusCleanup) {
    overlay._trapFocusCleanup();
    delete overlay._trapFocusCleanup;
  }
}

// ============================================================
// ОТРИСОВКА СПИСКА СОХРАНЁННЫХ
// ============================================================
export function renderSavedLists() {
  const container = document.getElementById(CONSTANTS.SELECTORS.savedListsList);
  const keys = getSavedShoppingListKeys();
  container.innerHTML = '';
  if (keys.length === 0) {
    container.innerHTML = '<div class="modal-empty">😌 Нет сохранённых списков.</div>';
    return;
  }
  keys.forEach(key => {
    let label = '';
    if (key.startsWith('shoppingList_range_')) {
      const parts = key.replace('shoppingList_range_', '').split('_to_');
      if (parts.length === 2) {
        const from = new Date(parts[0]);
        const to = new Date(parts[1]);
        if (parts[0] === parts[1]) {
          label = Utils.formatDate(from);
        } else {
          label = `период ${Utils.formatDate(from)} — ${Utils.formatDate(to)}`;
        }
      }
    } else {
      const dateStr = key.replace('shoppingList_', '');
      label = Utils.formatDate(new Date(dateStr));
    }

    const item = document.createElement('div');
    item.className = 'saved-list-item';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'list-date';
    dateSpan.textContent = label;
    item.appendChild(dateSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'list-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Удалить список';
    deleteBtn.setAttribute('aria-label', `Удалить список ${label}`);
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm(`Удалить список "${label}"?`)) {
        localStorage.removeItem(key);
        renderSavedLists();
        document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay).style.display = 'none';
        document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'block';
      }
    });
    item.appendChild(deleteBtn);

    item.addEventListener('click', function() {
      loadShoppingList(key);
    });

    container.appendChild(item);
  });
}

// ============================================================
// ЗАГРУЗКА СОХРАНЁННОГО СПИСКА
// ============================================================
export function loadShoppingList(key) {
  const saved = localStorage.getItem(key);
  if (!saved) {
    showMessage('Список не найден', 'error');
    return;
  }
  let text = saved;
  try {
    const parsed = JSON.parse(saved);
    if (parsed.groups) {
      let txt = '';
      const sorted = Object.keys(parsed.groups).sort();
      for (const dept of sorted) {
        txt += dept + ':\n';
        parsed.groups[dept].forEach(ing => {
          txt += '• ' + ing + '\n';
        });
        txt += '\n';
      }
      text = txt;
    }
  } catch(e) {}

  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'none';
  const displayDiv = document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay);
  displayDiv.style.display = 'block';

  const resultTextarea = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult);
  resultTextarea.value = text;

  let periodLabel = '';
  if (key.startsWith('shoppingList_range_')) {
    const parts = key.replace('shoppingList_range_', '').split('_to_');
    if (parts.length === 2) {
      const from = new Date(parts[0]);
      const to = new Date(parts[1]);
      if (parts[0] === parts[1]) {
        periodLabel = Utils.formatDate(from);
      } else {
        periodLabel = `${Utils.formatDate(from)} — ${Utils.formatDate(to)}`;
      }
    }
  } else {
    const dateStr = key.replace('shoppingList_', '');
    periodLabel = Utils.formatDate(new Date(dateStr));
  }

  const container = displayDiv;
  const textarea = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult);
  const oldHeader = container.querySelector('.list-header');
  if (oldHeader) oldHeader.remove();
  const newHeader = document.createElement('div');
  newHeader.className = 'list-header shopping-list-header';
  newHeader.textContent = `📋 Список на ${periodLabel}`;
  container.insertBefore(newHeader, textarea);

  displayDiv.dataset.currentKey = key;
  document.getElementById(CONSTANTS.SELECTORS.saveCurrentListBtn).style.display = 'none';
  document.getElementById(CONSTANTS.SELECTORS.deleteCurrentListBtn).style.display = 'inline-block';
}

// ============================================================
// ГЕНЕРАЦИЯ СПИСКА ПОКУПОК
// ============================================================
export function generateShoppingList() {
  const fromDate = document.getElementById(CONSTANTS.SELECTORS.shoppingDateFrom).value;
  const toDate = document.getElementById(CONSTANTS.SELECTORS.shoppingDateTo).value;
  if (!fromDate || !toDate) {
    showMessage('Выберите обе даты периода', 'error');
    return;
  }
  if (fromDate > toDate) {
    showMessage('Дата "От" не может быть позже даты "До"', 'error');
    return;
  }

  let allDishes = [];
  let current = new Date(fromDate);
  const end = new Date(toDate);
  while (current <= end) {
    const dateStr = Utils.formatDateLocal(current);
    const dayDishes = DishStore.getForDate(dateStr);
    allDishes = allDishes.concat(dayDishes);
    current.setDate(current.getDate() + 1);
  }

  const items = [];
  allDishes.forEach(dish => {
    if (dish.recipeId) {
      const recipe = RecipeStore.getById(dish.recipeId);
      if (recipe) {
        recipe.ingredients.forEach(ing => {
          items.push(ing);
        });
      }
    }
  });

  if (items.length === 0) {
    showMessage('😌 За выбранный период нет блюд с рецептами.');
    return;
  }

  const grouped = {};
  items.forEach(ing => {
    const dept = classifyIngredient(ing);
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(ing);
  });

  let text = '';
  const sortedDepartments = Object.keys(grouped).sort();
  for (const dept of sortedDepartments) {
    text += dept + ':\n';
    grouped[dept].forEach(ing => {
      text += '• ' + ing + '\n';
    });
    text += '\n';
  }

  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'none';
  const displayDiv = document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay);
  displayDiv.style.display = 'block';

  const resultTextarea = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult);
  const periodLabel = fromDate === toDate ? Utils.formatDate(new Date(fromDate)) : `${Utils.formatDate(new Date(fromDate))} — ${Utils.formatDate(new Date(toDate))}`;
  const container = displayDiv;
  const oldHeader = container.querySelector('.list-header');
  if (oldHeader) oldHeader.remove();
  const newHeader = document.createElement('div');
  newHeader.className = 'list-header shopping-list-header';
  newHeader.textContent = `📋 Предварительный список за ${periodLabel}`;
  container.insertBefore(newHeader, resultTextarea);

  resultTextarea.value = text;

  displayDiv.dataset.fromDate = fromDate;
  displayDiv.dataset.toDate = toDate;
  displayDiv.dataset.generatedGroups = JSON.stringify(grouped);

  document.getElementById(CONSTANTS.SELECTORS.saveCurrentListBtn).style.display = 'inline-block';
  document.getElementById(CONSTANTS.SELECTORS.deleteCurrentListBtn).style.display = 'none';
}

// ============================================================
// СОХРАНЕНИЕ ТЕКУЩЕГО СПИСКА
// ============================================================
export function saveCurrentList() {
  const displayDiv = document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay);
  const fromDate = displayDiv.dataset.fromDate;
  const toDate = displayDiv.dataset.toDate;
  if (!fromDate || !toDate) {
    showMessage('Нет данных для сохранения. Сначала сгенерируйте список.', 'error');
    return;
  }

  const text = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult).value;
  if (!text.trim()) {
    showMessage('Список пуст, нечего сохранять.', 'error');
    return;
  }

  let key;
  if (fromDate === toDate) {
    key = `shoppingList_${fromDate}`;
  } else {
    key = `shoppingList_range_${fromDate}_to_${toDate}`;
  }

  localStorage.setItem(key, text);

  showMessage('✅ Список сохранён!');
  document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay).style.display = 'none';
  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'block';
  renderSavedLists();
  delete displayDiv.dataset.generatedGroups;
  delete displayDiv.dataset.fromDate;
  delete displayDiv.dataset.toDate;
  const header = displayDiv.querySelector('.list-header');
  if (header) header.remove();
}

// ============================================================
// УДАЛЕНИЕ ТЕКУЩЕГО СПИСКА
// ============================================================
export function deleteCurrentList() {
  const displayDiv = document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay);
  const key = displayDiv.dataset.currentKey;
  if (!key) return;
  if (!confirm(`Удалить этот список?`)) return;
  localStorage.removeItem(key);
  document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay).style.display = 'none';
  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'block';
  renderSavedLists();
}

// ============================================================
// ВОЗВРАТ К СПИСКУ СОХРАНЁННЫХ
// ============================================================
export function backToSavedLists() {
  document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay).style.display = 'none';
  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'block';
  renderSavedLists();
}

// ============================================================
// ЭКСПОРТ СПИСКА В TXT
// ============================================================
export function exportShoppingListTxt() {
  const text = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult).value;
  if (!text.trim()) {
    showMessage('Нет текста для экспорта.', 'error');
    return;
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const now = new Date();
  a.download = `shopping_list_${Utils.formatDateLocal(now)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ
// ============================================================
export function initShoppingListHandlers() {
  document.getElementById(CONSTANTS.SELECTORS.generateShoppingListBtn).addEventListener('click', generateShoppingList);
  document.getElementById(CONSTANTS.SELECTORS.saveCurrentListBtn).addEventListener('click', saveCurrentList);
  document.getElementById(CONSTANTS.SELECTORS.deleteCurrentListBtn).addEventListener('click', deleteCurrentList);
  document.getElementById(CONSTANTS.SELECTORS.backToSavedListsBtn).addEventListener('click', backToSavedLists);
  document.getElementById(CONSTANTS.SELECTORS.exportShoppingListTxtBtn).addEventListener('click', exportShoppingListTxt);
}
