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
  [MEAL_TYPES.BREAKFAST]: '🌅 Завтрак',
  [MEAL_TYPES.LUNCH]: '☀️ Обед',
  [MEAL_TYPES.DINNER]: '🌙 Ужин',
  [MEAL_TYPES.SNACK]: '🍎 Перекус'
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
    RECIPES: 'smartMenuRecipes_v1',
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
    recOverlay: 'recOverlay',
    recTitle: 'recTitle',
    recContent: 'recContent',
    themeToggle: 'themeToggle',
    searchInput: 'searchInput',
    statusFilter: 'statusFilter',
    categoryFilter: 'categoryFilter',
    viewToggle: 'viewToggle',
    modalClose: 'modalClose',
    recClose: 'recClose',
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
    choiceFromMenu: 'choiceFromMenu',
    choiceFromTaste: 'choiceFromTaste',
    choiceFromRecipes: 'choiceFromRecipes',
    choiceFromFavorites: 'choiceFromFavorites',
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
