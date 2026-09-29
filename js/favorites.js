/**
 * favorites.js - LocalStorage based Bookmark Management
 */
const STORAGE_KEY = "BUSAN_24CONVINI_FAVORITES";

export const FavoritesManager = {
  favorites: new Set(),

  init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.favorites = new Set(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load favorites from localStorage", e);
    }
  },

  isFavorite(id) {
    return this.favorites.has(id);
  },

  toggle(id) {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
    } else {
      this.favorites.add(id);
    }
    this.save();
    return this.isFavorite(id);
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.favorites)));
    } catch (e) {
      console.warn("Failed to save favorites to localStorage", e);
    }
  },

  getCount() {
    return this.favorites.size;
  },

  getAll() {
    return Array.from(this.favorites);
  }
};
