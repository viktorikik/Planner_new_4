/**
 * RecipeFeatureEngine — движок извлечения и обогащения характеристик рецепта.
 * 
 * v1.0 (v6.3.0):
 *   • Генерация mealRole (роль блюда в композиции) на основе категории.
 *   • Перенос логики autoDetectTags из RecipeStore для чистоты архитектуры.
 *   • Безопасная обработка новых полей (flavorProfile, texture, isHeavy, isQuick).
 *   • Кэширование вычисленных признаков для оптимизации.
 */

export const RecipeFeatureEngine = (function() {
  const featureCache = new Map();

  // Маппинг категорий (из JSON) в роли (mealRole)
  const CATEGORY_TO_ROLE = {
    'soup': 'first_course',
    'salad': 'salad',
    'main': 'main',
    'side_dish': 'side',
    'appetizer': 'snack',
    'bakery': 'dessert',
    'dessert': 'dessert',
    'other': 'complement'
  };

  // ============================================================
  // АВТООПРЕДЕЛЕНИЕ ТЕГОВ (перенесено из RecipeStore)
  // ============================================================
  function autoDetectTags(recipe) {
    const text = (
      (recipe.name || '') + ' ' + 
      (recipe.ingredients || []).map(i => typeof i === 'string' ? i : i.name).join(' ')
    ).toLowerCase().replace(/ё/g, 'е');

    let tags = {
      proteinSource: 'vegetarian',
      proteinForm: 'none',
      cookingMethod: 'bake',
      baseType: 'none',
      nutritionProfile: 'balanced'
    };

    if (/куриц|куриное|цыплен|индейк|утк/.test(text)) tags.proteinSource = 'chicken';
    else if (/говяд|телятин|баранин/.test(text)) tags.proteinSource = 'beef';
    else if (/свинин|бекон|карбонад|ветчин/.test(text)) tags.proteinSource = 'pork';
    else if (/рыб|сельд|минтай|лосось|треск|тунец|скумбри/.test(text)) tags.proteinSource = 'fish';
    else if (/креветк|кальмар|краб|морепродукт|моллюск/.test(text)) tags.proteinSource = 'seafood';
    else if (/фарш/.test(text) && tags.proteinSource === 'vegetarian') tags.proteinSource = 'mixed';

    if (/фарш|котлет|тефтел|фрикадел/.test(text)) tags.proteinForm = 'minced';
    else if (/колбас|сосиск|сардельк/.test(text)) tags.proteinForm = 'processed';
    else if (tags.proteinSource !== 'vegetarian') tags.proteinForm = 'whole';

    if (recipe.category === 'salad' || /сырой|свеж/.test(text)) tags.cookingMethod = 'raw';
    else if (/запек|духовк|запекан/.test(text)) tags.cookingMethod = 'bake';
    else if (/туш|рагу|бигус|бигос|плов/.test(text)) tags.cookingMethod = 'stew';
    else if (/жар|обжар|сковород|шницель|блин/.test(text)) tags.cookingMethod = 'fry';
    else if (/вар|суп|бульон|паров/.test(text)) tags.cookingMethod = 'boil';

    if (/картоф|пюре/.test(text)) tags.baseType = 'potato';
    else if (/рис/.test(text)) tags.baseType = 'rice';
    else if (/макарон|паст|спагетти|лапш/.test(text)) tags.baseType = 'pasta';
    else if (/греч|булгур|перлов|круп|овсян|киноа/.test(text)) tags.baseType = 'grains';
    else if (/фасол|горох|чечевиц|нут/.test(text)) tags.baseType = 'legumes';
    else if (/овощ|капуст|кабач|брокколи|салат/.test(text)) tags.baseType = 'vegetables';

    if (recipe.category === 'salad' || tags.baseType === 'vegetables' || tags.baseType === 'legumes') {
      tags.nutritionProfile = 'high_fiber';
    } else if (tags.proteinSource !== 'vegetarian' && tags.baseType === 'none') {
      tags.nutritionProfile = 'high_protein';
    } else if (recipe.category === 'soup') {
      tags.nutritionProfile = 'light';
    }

    return tags;
  }

  // ============================================================
  // ОСНОВНОЙ МЕТОД ОБОГАЩЕНИЯ
  // ============================================================
  function enrichRecipe(recipe) {
    // Проверка кэша (по ID и времени обновления)
    const cacheKey = recipe.id + '_' + (recipe.updatedAt || '');
    if (featureCache.has(cacheKey)) {
      return featureCache.get(cacheKey);
    }

    const enriched = { ...recipe };

    // 1. Определение роли (mealRole)
    if (!enriched.mealRole) {
      enriched.mealRole = CATEGORY_TO_ROLE[enriched.category] || 'complement';
    }

    // 2. Безопасное добавление новых полей (если их нет в JSON)
    if (!Array.isArray(enriched.flavorProfile)) enriched.flavorProfile = [];
    if (!Array.isArray(enriched.texture)) enriched.texture = [];
    if (typeof enriched.isHeavy !== 'boolean') enriched.isHeavy = false;
    if (typeof enriched.isQuick !== 'boolean') enriched.isQuick = false;

    // 3. Теги (если переданы извне — берем их, иначе генерируем)
    if (!enriched.tags) {
      enriched.tags = autoDetectTags(enriched);
    } else {
      // Если теги частично заполнены, дополняем недостающие
      const autoTags = autoDetectTags(enriched);
      enriched.tags = { ...autoTags, ...enriched.tags };
    }

    featureCache.set(cacheKey, enriched);
    return enriched;
  }

  return {
    enrichRecipe,
    autoDetectTags
  };
})();
