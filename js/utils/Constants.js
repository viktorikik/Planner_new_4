// Статусы
export const STATUSES = {
  DONE: 'done',
  PLANNED: 'planned'
};

// Категории
export const CATEGORIES = {
  SOUP: 'soup',
  SALAD: 'salad',
  MAIN: 'main',
  BAKERY: 'bakery',
  OTHER: 'other'
};

export const CATEGORY_LABELS = {
  [CATEGORIES.SOUP]: '🍲 Супы',
  [CATEGORIES.SALAD]: '🥗 Салаты',
  [CATEGORIES.MAIN]: '🍖 Основные блюда',
  [CATEGORIES.BAKERY]: '🥐 Выпечка',
  [CATEGORIES.OTHER]: '🍽️ Другое'
};

// Приёмы пищи (v4.0)
// null = не указан. Старые блюда остаются null без миграции.
export const MEAL_TYPES = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack'
};

export const MEAL_TYPE_LABELS = {
  [MEAL_TYPES.BREAKFAST]: 'Завтрак',
  [MEAL_TYPES.LUNCH]: 'Обед',
  [MEAL_TYPES.DINNER]: 'Ужин',
  [MEAL_TYPES.SNACK]: 'Перекус'
};

// Кухни (для карточки рецепта, v6.0)
// Ключи латиницей, подписи — русские.
export const CUISINES = {
  RUSSIAN: 'russian',
  UKRAINIAN: 'ukrainian',
  CAUCASIAN: 'caucasian',
  ITALIAN: 'italian',
  FRENCH: 'french',
  MEDITERRANEAN: 'mediterranean',
  GREEK: 'greek',
  AMERICAN: 'american',
  MEXICAN: 'mexican',
  CHINESE: 'chinese',
  JAPANESE: 'japanese',
  KOREAN: 'korean',
  INDIAN: 'indian',
  ASIAN: 'asian',
  INTERNATIONAL: 'international'
};

export const CUISINE_LABELS = {
  [CUISINES.RUSSIAN]: 'Русская',
  [CUISINES.UKRAINIAN]: 'Украинская',
  [CUISINES.CAUCASIAN]: 'Кавказская',
  [CUISINES.ITALIAN]: 'Итальянская',
  [CUISINES.FRENCH]: 'Французская',
  [CUISINES.MEDITERRANEAN]: 'Средиземноморская',
  [CUISINES.GREEK]: 'Греческая',
  [CUISINES.AMERICAN]: 'Американская',
  [CUISINES.MEXICAN]: 'Мексиканская',
  [CUISINES.CHINESE]: 'Китайская',
  [CUISINES.JAPANESE]: 'Японская',
  [CUISINES.KOREAN]: 'Корейская',
  [CUISINES.INDIAN]: 'Индийская',
  [CUISINES.ASIAN]: 'Азиатская',
  [CUISINES.INTERNATIONAL]: 'Международная'
};

// Аллергены (для карточки рецепта, v6.0)
// Ключи латиницей, подписи — русские.
// Список соответствует европейскому стандарту (14 аллергенов) плюс клубника и пищевые добавки.
export const ALLERGENS = {
  NUTS: 'nuts',
  EGGS: 'eggs',
  GLUTEN: 'gluten',
  FISH: 'fish',
  MILK: 'milk',
  PEANUT: 'peanut',
  ADDITIVES: 'additives',
  MUSTARD: 'mustard',
  SESAME: 'sesame',
  MOLLUSCS: 'molluscs',
  CRUSTACEANS: 'crustaceans',
  STRAWBERRY: 'strawberry',
  SOY: 'soy',
  CELERY: 'celery',
  LUPIN: 'lupin'
};

export const ALLERGEN_LABELS = {
  [ALLERGENS.NUTS]: 'Орехи',
  [ALLERGENS.EGGS]: 'Яйцо',
  [ALLERGENS.GLUTEN]: 'Злаки, содержащие глютен',
  [ALLERGENS.FISH]: 'Рыба',
  [ALLERGENS.MILK]: 'Белок коровьего молока',
  [ALLERGENS.PEANUT]: 'Арахис',
  [ALLERGENS.ADDITIVES]: 'Пищевые добавки',
  [ALLERGENS.MUSTARD]: 'Горчица',
  [ALLERGENS.SESAME]: 'Кунжут',
  [ALLERGENS.MOLLUSCS]: 'Моллюски',
  [ALLERGENS.CRUSTACEANS]: 'Ракообразные',
  [ALLERGENS.STRAWBERRY]: 'Клубника',
  [ALLERGENS.SOY]: 'Соя',
  [ALLERGENS.CELERY]: 'Сельдерей',
  [ALLERGENS.LUPIN]: 'Люпин и продукты его переработки'
};

// Единицы измерения ингредиентов (v6.0)
// Используются в структурированных ингредиентах { name, amount, unit }.
// Весовые единицы (g, kg, ml, l) при пересчёте порций масштабируются,
// штучные (pcs, tbsp, tsp, pinch, clove, bunch) — не пересчитываются.
export const UNITS = {
  G: 'g',
  KG: 'kg',
  ML: 'ml',
  L: 'l',
  PCS: 'pcs',
  TBSP: 'tbsp',
  TSP: 'tsp',
  PINCH: 'pinch',
  CLOVE: 'clove',
  BUNCH: 'bunch'
};

export const UNIT_LABELS = {
  [UNITS.G]: 'г',
  [UNITS.KG]: 'кг',
  [UNITS.ML]: 'мл',
  [UNITS.L]: 'л',
  [UNITS.PCS]: 'шт',
  [UNITS.TBSP]: 'ст.л.',
  [UNITS.TSP]: 'ч.л.',
  [UNITS.PINCH]: 'щепотка',
  [UNITS.CLOVE]: 'зубчик',
  [UNITS.BUNCH]: 'пучок'
};

// Единицы, которые НЕ масштабируются при изменении числа порций.
// Всё остальное (g, kg, ml, l) — масштабируется.
export const NON_SCALABLE_UNITS = [
  UNITS.PCS, UNITS.TBSP, UNITS.TSP, UNITS.PINCH, UNITS.CLOVE, UNITS.BUNCH
];

// Шкалы для карточки рецепта (v6.0)
export const DIFFICULTY_LABELS = {
  1: 'Очень просто',
  2: 'Просто',
  3: 'Средне',
  4: 'Сложно',
  5: 'Очень сложно'
};

export const SPICINESS_LABELS = {
  1: 'Не остро',
  2: 'Слегка остро',
  3: 'Средне остро',
  4: 'Остро',
  5: 'Очень остро'
};

// Список продуктов для распознавания ингредиентов
export const PRODUCT_WORDS = [
  'лук', 'морковь', 'картофель', 'капуста', 'свекла', 'редис', 'репа',
  'огурец', 'помидор', 'перец', 'баклажан', 'кабачок', 'тыква',
  'чеснок', 'зелень', 'петрушка', 'укроп', 'базилик', 'кинза',
  'салат', 'шпинат', 'щавель', 'ревень', 'сельдерей',
  'рис', 'гречка', 'овсянка', 'перловка', 'пшено', 'кускус', 'булгур',
  'макароны', 'паста', 'лапша', 'вермишель', 'спагетти',
  'говядина', 'свинина', 'баранина', 'телятина', 'курица', 'индейка',
  'утка', 'гусь', 'кролик', 'фарш', 'печень', 'сердце', 'почки',
  'тунец', 'горбуша', 'лосось', 'форель', 'сёмга', 'кета', 'кижуч',
  'треска', 'пикша', 'окунь', 'судак', 'щука', 'сом', 'налим',
  'осётр', 'пангасиус', 'тилапия', 'дорада', 'сибас', 'ставрида',
  'скумбрия', 'макрель', 'сельдь', 'шпроты', 'килька',
  'креветки', 'мидии', 'кальмары', 'краб',
  'молоко', 'сливки', 'сметана', 'йогурт', 'кефир', 'ряженка',
  'творог', 'сыр', 'масло', 'маргарин', 'майонез', 'кетчуп',
  'яйцо',
  'соль', 'перец', 'сахар', 'мука', 'крахмал',
  'корица', 'ваниль', 'какао', 'шоколад',
  'орегано', 'тимьян', 'розмарин', 'кориандр', 'тмин', 'кумин',
  'паприка', 'куркума', 'имбирь', 'шафран', 'гвоздика', 'кардамон',
  'яблоко', 'груша', 'айва', 'хурма', 'гранат',
  'лимон', 'лайм', 'грейпфрут', 'мандарин', 'апельсин',
  'клубника', 'малина', 'черника', 'ежевика', 'смородина', 'крыжовник',
  'вишня', 'черешня', 'слива', 'абрикос', 'персик', 'нектарин',
  'банан', 'киви', 'манго', 'ананас', 'гранат',
  'арбуз', 'дыня',
  'финик', 'инжир', 'курага', 'чернослив', 'изюм',
  'орех', 'миндаль', 'фисташка', 'кешью', 'грецкий орех', 'фундук',
  'гриб', 'шампиньон', 'белый гриб', 'подберёзовик', 'лисичка',
  'вода', 'бульон', 'вино', 'коньяк', 'ром', 'пиво',
  'чай', 'кофе', 'какао', 'компот', 'кисель', 'морс', 'квас',
  'лимонад', 'сок', 'нектар',
  'оливковое масло', 'подсолнечное масло', 'сливочное масло',
  'варенье', 'джем', 'конфитюр', 'мёд', 'сироп', 'пастила', 'мармелад',
  'дрожжи', 'разрыхлитель', 'сода', 'уксус', 'лимонная кислота',
  'желатин', 'пудра', 'цукаты', 'карамель', 'сгущёнка', 'ванильный сахар'
];

// Объект с ключами хранилища, событиями и селекторами
export const CONSTANTS = {
  STORAGE_KEYS: {
    RECIPES: 'smartMenuRecipes_v2',
    RECIPES_LEGACY: 'smartMenuRecipes_v1',
    DISHES: 'smartMenuDishes_v5',
    THEME: 'mealPlannerTheme',
    ONBOARDING_SHOWN: 'smartMenuOnboardingShown_v1',
    RECIPES_COLLAPSED: 'smartMenuRecipesCollapsed_v1'
  },
  EVENTS: {
    DISHES_CHANGED: 'dishes:changed',
    RECIPES_CHANGED: 'recipes:changed'
  },
  SELECTORS: {
    monthTitle: 'monthTitle',
    calendarContent: 'calendarContent',
    menuContent: 'menuContent',
    menuPeriod: 'menuPeriod',
    modalOverlay: 'modalOverlay',
    modalTitle: 'modalTitle',
    modalContent: 'modalContent',
    themeToggle: 'themeToggle',
    searchInput: 'searchInput',
    statusFilter: 'statusFilter',
    categoryFilter: 'categoryFilter',
    viewToggle: 'viewToggle',
    modalClose: 'modalClose',
    addModalOverlay: 'addModalOverlay',
    addModalClose: 'addModalClose',
    addModalCancel: 'addModalCancel',
    newDishName: 'newDishName',
    newDishNote: 'newDishNote',
    newDishDate: 'newDishDate',
    newDishStatus: 'newDishStatus',
    newDishCategory: 'newDishCategory',
    newDishMealTypesGroup: 'newDishMealTypesGroup',
    newDishRecipe: 'newDishRecipe',
    addModalSave: 'addModalSave',
    // ---- Модалка редактирования блюда ----
    editDishOverlay: 'editDishOverlay',
    editDishClose: 'editDishClose',
    editDishId: 'editDishId',
    editDishName: 'editDishName',
    editDishNote: 'editDishNote',
    editDishStatus: 'editDishStatus',
    editDishCategory: 'editDishCategory',
    editDishMealTypesGroup: 'editDishMealTypesGroup',
    editDishRecipe: 'editDishRecipe',
    editDishCancel: 'editDishCancel',
    editDishSave: 'editDishSave',
    // ---- Модалка «Повторить меню» ----
    repeatMenuOverlay: 'repeatMenuOverlay',
    repeatMenuClose: 'repeatMenuClose',
    repeatMenuDate: 'repeatMenuDate',
    repeatMenuSourceDate: 'repeatMenuSourceDate',
    repeatMenuCancel: 'repeatMenuCancel',
    repeatMenuSave: 'repeatMenuSave',
    // ---------------------------------------------
    exportModalOverlay: 'exportModalOverlay',
    exportModalClose: 'exportModalClose',
    choiceOverlay: 'choiceOverlay',
    choiceClose: 'choiceClose',
    welcomeOverlay: 'welcomeOverlay',
    welcomeStartBtn: 'welcomeStartBtn',
    recipesOverlay: 'recipesOverlay',
    recipesClose: 'recipesClose',
    todayContent: 'todayContent',
    recipesBackBtn: 'recipesBackBtn',
    recipesTitle: 'recipesTitle',
    recipesList: 'recipesList',
    addRecipeBtn: 'addRecipeBtn',
    exportRecipesBtn: 'exportRecipesBtn',
    importRecipesBtn: 'importRecipesBtn',
    importRecipesFileInput: 'importRecipesFileInput',
    recipesSearchInput: 'recipesSearchInput',
    recipesCategoryFilter: 'recipesCategoryFilter',
    recipeExportOverlay: 'recipeExportOverlay',
    recipeExportClose: 'recipeExportClose',
    recipeExportOptions: '.recipe-export-option',
    recipeFormOverlay: 'recipeFormOverlay',
    recipeFormClose: 'recipeFormClose',
    recipeFormTitle: 'recipeFormTitle',
    recipeFormId: 'recipeFormId',
    recipeName: 'recipeName',
    recipeIngredients: 'recipeIngredients',
    recipeInstructions: 'recipeInstructions',
    recipeCategory: 'recipeCategory',
    recipeFormCancel: 'recipeFormCancel',
    recipeFormSave: 'recipeFormSave',
    recipeParseBtn: 'recipeParseBtn',
    shoppingListOverlay: 'shoppingListOverlay',
    shoppingListClose: 'shoppingListClose',
    shoppingDateFrom: 'shoppingDateFrom',
    shoppingDateTo: 'shoppingDateTo',
    generateShoppingListBtn: 'generateShoppingListBtn',
    savedListsContainer: 'savedListsContainer',
    savedListsList: 'savedListsList',
    shoppingListDisplay: 'shoppingListDisplay',
    shoppingListResult: 'shoppingListResult',
    saveCurrentListBtn: 'saveCurrentListBtn',
    deleteCurrentListBtn: 'deleteCurrentListBtn',
    backToSavedListsBtn: 'backToSavedListsBtn',
    exportShoppingListTxtBtn: 'exportShoppingListTxtBtn',
    shoppingListView: 'shoppingListView',
    shoppingListEditBtn: 'shoppingListEditBtn',
    importFileInput: 'importFileInput',
    importBtn: 'importBtn',
    exportBtn: 'exportBtn',
    suggestBtn: 'suggestBtn',
    recipesBtn: 'recipesBtn',
    shoppingListBtn: 'shoppingListBtn',
    addDishBtn: 'addDishBtn',
    prevMonth: 'prevMonth',
    nextMonth: 'nextMonth',
    todayBtn: 'todayBtn',
    calendarWrap: 'calendarWrap',
    viewToggleButtons: '#viewToggle button',
    exportOptions: '.export-option',

    // ---- Bottom navigation (v4.0) ----
    bottomNav: 'bottomNav',
    bottomNavButtons: '.bottom-nav-btn',

    // ---- Обучающий тур ----
    onboardingHelpBtn: 'onboardingHelpBtn',
    onboardingOverlay: 'onboardingOverlay',
    onboardingSlides: 'onboardingSlides',
    onboardingDots: 'onboardingDots',
    onboardingPrev: 'onboardingPrev',
    onboardingNext: 'onboardingNext',
    onboardingSkip: 'onboardingSkip',
    onboardingClose: 'onboardingClose'
  }
};
