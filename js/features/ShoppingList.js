import { CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';
import { trapFocus } from '../utils/focusTrap.js';

// ============================================================
// КАТЕГОРИИ ПРОДУКТОВ (отделы магазина)
// ============================================================
// Ключи пишем через «е», а не «ё» — нормализация делается в classifyIngredient.
// Внутри одного отдела ключи могут пересекаться (например, «перец» и «сладкий перец») —
// при проверке сначала идут более длинные ключи, чтобы «сладкий перец» не терялся.
const DEPARTMENTS = {
  'Овощи, зелень': [
    'болгарский перец', 'сладкий перец', 'цветная капуста', 'брюссельская капуста',
    'стручковая фасоль', 'зеленый горошек', 'листовой салат',
    'лук', 'морковь', 'картофель', 'капуста', 'свекла', 'редис', 'репа',
    'огурец', 'помидор', 'томат', 'перец', 'баклажан', 'кабачок', 'тыква',
    'чеснок', 'зелень', 'петрушка', 'укроп', 'базилик', 'кинза',
    'салат', 'шпинат', 'щавель', 'ревень', 'сельдерей',
    'брокколи', 'спаржа', 'кукуруза', 'авокадо', 'имбирь'
  ],
  'Фрукты, ягоды': [
    'яблоко', 'груша', 'айва', 'хурма', 'гранат',
    'лимон', 'лайм', 'грейпфрут', 'мандарин', 'апельсин',
    'клубника', 'малина', 'черника', 'ежевика', 'смородина', 'крыжовник',
    'вишня', 'черешня', 'слива', 'абрикос', 'персик', 'нектарин',
    'банан', 'киви', 'манго', 'ананас', 'арбуз', 'дыня', 'финик', 'инжир'
  ],
  'Мясо, птица': [
    'куриная грудка', 'куриное филе', 'свиная шея', 'говяжья печень',
    'говядина', 'свинина', 'баранина', 'телятина', 'курица', 'индейка',
    'утка', 'гусь', 'кролик', 'фарш', 'печень', 'сердце', 'почки',
    'сало', 'бекон', 'ветчина', 'колбаса', 'сосиски'
  ],
  'Рыба, морепродукты': [
    'тунец', 'горбуша', 'лосось', 'форель', 'сёмга', 'кета', 'кижуч',
    'треска', 'пикша', 'окунь', 'судак', 'щука', 'сом', 'налим',
    'осётр', 'пангасиус', 'тилапия', 'дорада', 'сибас', 'ставрида',
    'скумбрия', 'макрель', 'сельдь', 'шпроты', 'килька',
    'креветки', 'мидии', 'кальмары', 'краб', 'икра'
  ],
  'Молочные продукты': [
    'сливочное масло', 'топленое масло',
    'молоко', 'сливки', 'сметана', 'йогурт', 'кефир', 'ряженка',
    'творог', 'сыр', 'брынза', 'моцарелла', 'пармезан', 'маргарин', 'сгущенка'
  ],
  'Яйца': [
    'яйцо', 'яйца', 'яичный белок', 'яичный желток', 'желток', 'белок'
  ],
  'Хлеб, выпечка': [
    'хлеб', 'батон', 'булка', 'лаваш', 'пита', 'багет', 'сухари',
    'печенье', 'вафли', 'пряники', 'тортилья'
  ],
  'Крупы, макароны, бобовые': [
    'гречневая крупа', 'овсяные хлопья', 'пшеничная мука', 'кукурузная мука',
    'рис', 'гречка', 'овсянка', 'перловка', 'пшено', 'кускус', 'булгур',
    'макароны', 'паста', 'лапша', 'вермишель', 'спагетти', 'фетучини',
    'фасоль', 'горох', 'чечевица', 'нут', 'соя', 'мука', 'крахмал'
  ],
  'Соусы, специи': [
    'соевый соус', 'томатная паста', 'лимонная кислота',
    'майонез', 'кетчуп', 'горчица', 'уксус', 'соль', 'сахар',
    'черный перец', 'красный перец', 'молотый перец', 'перец горошком',
    'корица', 'ваниль', 'ванильный сахар', 'какао', 'шоколад',
    'орегано', 'тимьян', 'розмарин', 'кориандр', 'тмин', 'кумин',
    'паприка', 'куркума', 'шафран', 'гвоздика', 'кардамон',
    'лавровый лист', 'дрожжи', 'разрыхлитель', 'сода', 'желатин', 'пудра',
    'специи', 'приправа', 'бульонный кубик'
  ],
  'Масла, жиры': [
    'оливковое масло', 'подсолнечное масло', 'растительное масло',
    'кукурузное масло', 'кокосовое масло', 'кунжутное масло'
  ],
  'Консервы, заготовки': [
    'консервированный горошек', 'консервированная кукуруза',
    'консервы', 'соленья', 'маринад', 'оливки', 'маслины',
    'варенье', 'джем', 'конфитюр', 'мёд', 'сироп', 'пастила', 'мармелад'
  ],
  'Орехи, сухофрукты': [
    'грецкий орех', 'кедровый орех', 'кокосовая стружка',
    'курага', 'чернослив', 'изюм', 'цукаты',
    'орех', 'миндаль', 'фисташка', 'кешью', 'фундук', 'арахис'
  ],
  'Напитки, жидкости': [
    'вода', 'бульон', 'вино', 'коньяк', 'ром', 'пиво',
    'чай', 'кофе', 'компот', 'кисель', 'морс', 'квас',
    'лимонад', 'сок', 'нектар'
  ],
  'Грибы': [
    'белый гриб', 'шампиньон', 'подберезовик', 'подосиновик', 'лисичка',
    'вешенка', 'опята', 'гриб'
  ],
  'Заморозка': [
    'пельмени', 'вареники', 'мороженое', 'замороженные'
  ]
};

// Порядок отделов «как в магазине»
const DEPARTMENT_ORDER = [
  'Овощи, зелень',
  'Фрукты, ягоды',
  'Мясо, птица',
  'Рыба, морепродукты',
  'Молочные продукты',
  'Яйца',
  'Хлеб, выпечка',
  'Крупы, макароны, бобовые',
  'Соусы, специи',
  'Масла, жиры',
  'Консервы, заготовки',
  'Орехи, сухофрукты',
  'Грибы',
  'Заморозка',
  'Напитки, жидкости',
  'Прочее'
];

// Нормализация строки: нижний регистр, ё → е, обрезка
function normalize(str) {
  return String(str).toLowerCase().replace(/ё/g, 'е').trim();
}

// Проверка: слово kw встречается в text как отдельное слово (по границам)
function matchWord(text, kw) {
  let from = 0;
  while (true) {
    const idx = text.indexOf(kw, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : text[idx - 1];
    const after = idx + kw.length >= text.length ? '' : text[idx + kw.length];
    const isLetter = (ch) => /[а-яa-z0-9]/.test(ch);
    if (!isLetter(before) && !isLetter(after)) return true;
    from = idx + 1;
  }
}

// Классифицирует ингредиент по отделам магазина.
// На вход приходит строка (после Utils.formatIngredient).
function classifyIngredient(ingredient) {
  const lower = normalize(ingredient);
  for (const [department, keywords] of Object.entries(DEPARTMENTS)) {
    // Сортируем ключи по длине: длинные проверяются раньше (важно для «сладкий перец» и т.п.)
    const sorted = keywords.slice().sort((a, b) => b.length - a.length);
    for (const rawKw of sorted) {
      const kw = normalize(rawKw);
      // Многословные ключи ищутся как подстрока
      if (kw.includes(' ')) {
        if (lower.includes(kw)) return department;
      } else {
        if (matchWord(lower, kw)) return department;
      }
    }
  }
  return 'Прочее';
}

// ============================================================
// ПРЕОБРАЗОВАНИЯ: текст ⇄ группы
// ============================================================
function groupsToText(groups) {
  const sortedDepts = Object.keys(groups).sort((a, b) => {
    const ia = DEPARTMENT_ORDER.indexOf(a);
    const ib = DEPARTMENT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'ru');
  });
  let text = '';
  sortedDepts.forEach(dept => {
    const items = groups[dept];
    if (!items || items.length === 0) return;
    text += dept + ':\n';
    items.forEach(ing => { text += '• ' + ing + '\n'; });
    text += '\n';
  });
  return text.trim();
}

function parseTextToGroups(text) {
  const groups = {};
  let currentDept = null;
  text.split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;
    if (line.endsWith(':')) {
      currentDept = line.slice(0, -1).trim();
      if (!groups[currentDept]) groups[currentDept] = [];
    } else if (line.startsWith('•')) {
      if (currentDept) groups[currentDept].push(line.slice(1).trim());
    }
  });
  return groups;
}

// ============================================================
// РЕНДЕР HTML-ВИДА СПИСКА
// ============================================================
function renderGroupsHtml(groups, container) {
  container.innerHTML = '';
  if (!groups || Object.keys(groups).length === 0) {
    const empty = document.createElement('div');
    empty.className = 'shopping-list-empty';
    empty.textContent = '😌 Список пуст';
    container.appendChild(empty);
    return;
  }

  const sortedDepts = Object.keys(groups).sort((a, b) => {
    const ia = DEPARTMENT_ORDER.indexOf(a);
    const ib = DEPARTMENT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'ru');
  });

  sortedDepts.forEach(dept => {
    const items = groups[dept];
    if (!items || items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'shopping-group';

    const h = document.createElement('h4');
    h.className = 'shopping-group-title';
    h.textContent = dept;
    section.appendChild(h);

    const ul = document.createElement('ul');
    ul.className = 'shopping-items';
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    section.appendChild(ul);

    container.appendChild(section);
  });
}

// Рендер верхнего заголовка списка (дата/период)
function setHeaderLabel(label) {
  const view = document.getElementById(CONSTANTS.SELECTORS.shoppingListView);
  if (!view) return;
  let header = view.querySelector('.shopping-list-header');
  if (!header) {
    header = document.createElement('div');
    header.className = 'shopping-list-header';
    view.insertBefore(header, view.firstChild);
  }
  header.textContent = '📋 ' + label;
}

// ============================================================
// РАБОТА С СОХРАНЁННЫМИ СПИСКАМИ
// ============================================================
function getSavedShoppingListKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('shoppingList_')) keys.push(key);
  }
  return keys.sort();
}

function getPeriodLabel(key) {
  if (key.startsWith('shoppingList_range_')) {
    const parts = key.replace('shoppingList_range_', '').split('_to_');
    if (parts.length === 2) {
      const from = new Date(parts[0]);
      const to = new Date(parts[1]);
      if (parts[0] === parts[1]) return Utils.formatDate(from);
      return `период ${Utils.formatDate(from)} — ${Utils.formatDate(to)}`;
    }
    return '';
  }
  const dateStr = key.replace('shoppingList_', '');
  return Utils.formatDate(new Date(dateStr));
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
    const empty = document.createElement('div');
    empty.className = 'modal-empty';
    empty.textContent = '😌 Нет сохранённых списков.';
    container.appendChild(empty);
    return;
  }
  keys.forEach(key => {
    const label = getPeriodLabel(key);

    const item = document.createElement('div');
    item.className = 'saved-list-item';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'list-date';
    dateSpan.textContent = '📅 ' + label;
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
      }
    });
    item.appendChild(deleteBtn);

    item.addEventListener('click', function() { loadShoppingList(key); });
    container.appendChild(item);
  });
}

// ============================================================
// ЗАГРУЗКА СОХРАНЁННОГО СПИСКА
// ============================================================
export function loadShoppingList(key) {
  const saved = localStorage.getItem(key);
  if (!saved) { showMessage('Список не найден', 'error'); return; }

  let text = saved;
  try {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.groups) text = groupsToText(parsed.groups);
  } catch(e) { /* это уже текст */ }

  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'none';
  const displayDiv = document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay);
  displayDiv.style.display = 'block';

  const resultTextarea = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult);
  resultTextarea.value = text;
  resultTextarea.style.display = 'none';

  const view = document.getElementById(CONSTANTS.SELECTORS.shoppingListView);
  const groups = parseTextToGroups(text);
  renderGroupsHtml(groups, view);
  // Явно возвращаем view в видимое состояние — если до этого был режим
  // редактирования, он мог оставить view скрытым (display: none).
  view.style.display = 'block';
  setHeaderLabel('Список на ' + getPeriodLabel(key));

  // Кнопка «Редактировать вручную» — снова «✎»
  const editBtn = document.getElementById(CONSTANTS.SELECTORS.shoppingListEditBtn);
  if (editBtn) {
    editBtn.textContent = '✎ Редактировать вручную';
    editBtn.dataset.mode = 'view';
  }

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
  if (!fromDate || !toDate) { showMessage('Выберите обе даты периода', 'error'); return; }
  if (fromDate > toDate) { showMessage('Дата "От" не может быть позже даты "До"', 'error'); return; }

  let allDishes = [];
  let current = new Date(fromDate);
  const end = new Date(toDate);
  while (current <= end) {
    const dateStr = Utils.formatDateLocal(current);
    allDishes = allDishes.concat(DishStore.getForDate(dateStr));
    current.setDate(current.getDate() + 1);
  }

  const items = [];
  allDishes.forEach(dish => {
    if (dish.recipeId) {
      const recipe = RecipeStore.getById(dish.recipeId);
      if (recipe) {
        // Ингредиенты в рецепте — массив объектов { name, amount, unit }.
        // Для списка покупок переводим в человекочитаемую строку
        // («Свинина — 1,2 кг»). Хранение структуры в группах — задача Блока 3.
        recipe.ingredients.forEach(ing => {
          const line = Utils.formatIngredient(ing);
          if (line) items.push(line);
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

  const text = groupsToText(grouped);

  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'none';
  const displayDiv = document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay);
  displayDiv.style.display = 'block';

  const resultTextarea = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult);
  resultTextarea.value = text;
  resultTextarea.style.display = 'none';

  const view = document.getElementById(CONSTANTS.SELECTORS.shoppingListView);
  renderGroupsHtml(grouped, view);
  // То же самое: возвращаем view в видимое состояние после возможного
  // режима редактирования.
  view.style.display = 'block';

  const periodLabel = fromDate === toDate
    ? Utils.formatDate(new Date(fromDate))
    : `${Utils.formatDate(new Date(fromDate))} — ${Utils.formatDate(new Date(toDate))}`;
  setHeaderLabel('Предварительный список за ' + periodLabel);

  const editBtn = document.getElementById(CONSTANTS.SELECTORS.shoppingListEditBtn);
  if (editBtn) {
    editBtn.textContent = '✎ Редактировать вручную';
    editBtn.dataset.mode = 'view';
  }

  displayDiv.dataset.fromDate = fromDate;
  displayDiv.dataset.toDate = toDate;

  document.getElementById(CONSTANTS.SELECTORS.saveCurrentListBtn).style.display = 'inline-block';
  document.getElementById(CONSTANTS.SELECTORS.deleteCurrentListBtn).style.display = 'none';
}

// ============================================================
// РЕЖИМ РЕДАКТИРОВАНИЯ (переключение textarea ⇄ HTML)
// ============================================================
export function toggleShoppingListEdit() {
  const btn = document.getElementById(CONSTANTS.SELECTORS.shoppingListEditBtn);
  const textarea = document.getElementById(CONSTANTS.SELECTORS.shoppingListResult);
  const view = document.getElementById(CONSTANTS.SELECTORS.shoppingListView);

  if (btn.dataset.mode === 'edit') {
    // Заканчиваем редактирование: парсим текст → рендерим HTML
    const text = textarea.value;
    const groups = parseTextToGroups(text);
    renderGroupsHtml(groups, view);
    // Обновляем textarea нормализованным текстом
    textarea.value = groupsToText(groups);
    // Явный 'none' / 'block' — не полагаемся на пустую строку,
    // которую может перебить правило из styles.css.
    textarea.style.display = 'none';
    view.style.display = 'block';
    btn.textContent = '✎ Редактировать вручную';
    btn.dataset.mode = 'view';
  } else {
    // Переходим в режим редактирования
    // Явный 'block' — важно, иначе CSS-правило display: none на textarea
    // оставит его невидимым, и пользователь увидит пустое окно.
    textarea.style.display = 'block';
    view.style.display = 'none';
    btn.textContent = '✓ Готово';
    btn.dataset.mode = 'edit';
    // Фокус после отрисовки — на случай, если браузер ещё не пересчитал layout.
    setTimeout(() => textarea.focus(), 0);
  }
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
  if (!text.trim()) { showMessage('Список пуст, нечего сохранять.', 'error'); return; }

  const key = fromDate === toDate
    ? `shoppingList_${fromDate}`
    : `shoppingList_range_${fromDate}_to_${toDate}`;

  localStorage.setItem(key, text);
  showMessage('✅ Список сохранён!');
  document.getElementById(CONSTANTS.SELECTORS.shoppingListDisplay).style.display = 'none';
  document.getElementById(CONSTANTS.SELECTORS.savedListsContainer).style.display = 'block';
  renderSavedLists();
  delete displayDiv.dataset.fromDate;
  delete displayDiv.dataset.toDate;
  delete displayDiv.dataset.currentKey;
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
  if (!text.trim()) { showMessage('Нет текста для экспорта.', 'error'); return; }
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
  const editBtn = document.getElementById(CONSTANTS.SELECTORS.shoppingListEditBtn);
  if (editBtn) editBtn.addEventListener('click', toggleShoppingListEdit);
}
