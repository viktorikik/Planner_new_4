import { CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { showStorageError } from '../utils/notifications.js';

export const RecipeStore = (function() {
  const STORAGE_KEY = CONSTANTS.STORAGE_KEYS.RECIPES;
  let recipes = [];

  function generateId() { return Date.now() + Math.random() * 10000; }

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          recipes = parsed.map(r => {
            if (!r.category) r.category = Utils.guessCategory(r.name);
            return r;
          });
          return true;
        }
      }
    } catch(e) { console.warn('Ошибка загрузки рецептов:', e); }
    return false;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    } catch(e) {
      console.error('Ошибка сохранения рецептов:', e);
      showStorageError('рецепты');
    }
    EventBus.emit(CONSTANTS.EVENTS.RECIPES_CHANGED);
  }

  function init() {
    if (!load()) {
      recipes = [];
      save();
    } else {
      EventBus.emit(CONSTANTS.EVENTS.RECIPES_CHANGED);
    }
  }

  function getAll() { return recipes.slice(); }
  function getById(id) { return recipes.find(r => r.id === id); }
  function add(name, ingredients, instructions, category) {
    const id = generateId();
    const recipe = {
      id,
      name,
      ingredients: ingredients.split('\n').filter(s => s.trim()),
      instructions: instructions || '',
      category: category || Utils.guessCategory(name),
      createdAt: new Date().toISOString()
    };
    recipes.push(recipe);
    save();
    return recipe;
  }
  function update(id, name, ingredients, instructions, category) {
    const recipe = getById(id);
    if (!recipe) return false;
    recipe.name = name;
    recipe.ingredients = ingredients.split('\n').filter(s => s.trim());
    recipe.instructions = instructions || '';
    recipe.category = category || Utils.guessCategory(name);
    save();
    return true;
  }
  function remove(id) {
    const index = recipes.findIndex(r => r.id === id);
    if (index === -1) return false;
    recipes.splice(index, 1);
    save();
    return true;
  }

  return { init, getAll, getById, add, update, remove };
})();
