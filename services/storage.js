/**
 * TubePilot Storage Service
 */

const STORAGE_KEYS = {
  USER: 'tubepilot_user',
  TOKEN: 'tubepilot_token',
  CREDITS: 'tubepilot_credits',
  PROJECT: 'tp_project',
  HISTORY: 'tp_history',
  PRODUCTS: 'tubepilot_products',
  PRODUCT_LIMIT: 'tubepilot_product_limit'
};

class StorageService {
  static getInstance() {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  async get(key) {
    const result = await chrome.storage.local.get([key]);
    return result[key];
  }

  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key) {
    await chrome.storage.local.remove([key]);
  }

  async getMultiple(keys) {
    return chrome.storage.local.get(keys);
  }

  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes);
      }
    });
  }
}

StorageService.instance = null;
const storageService = StorageService.getInstance();
