/**
 * @typedef {Object} Contact
 * @property {string} contactName - The name of the contact.
 * @property {string} shortPublicKey - The shortened version of the contact's public key.
 * @property {number} avatarIndex - The index of the avatar image for the contact.
 */

/**
 * @typedef {Object} GroupMember
 * @property {string} userName - The name of the group member.
 * @property {number} avatarIndex - The index of the avatar image for the group member.
 */

/**
 * @typedef {Object} Group
 * @property {string} masterPrivateKey - The master private key of the group.
 * @property {string} masterPublicKey - The master public key of the group.
 * @property {string} groupName - The name of the group.
 * @property {Object.<string, string>} sessionKeys - A map of session keys for the group, keyed by session identifier.
 * @property {Object.<string, GroupMember>} members - A map of group members, keyed by their public key.
 */

/**
 * @typedef {Object} Currency
 * @property {number} assetType
 * @property {number} blockchain
 * @property {string} assetId
 * @property {string} name
 * @property {string} symbol
 * @property {number} decimals
 * @property {string?} icon
 */

/**
 * @typedef {Object} Blockchain
 * @property {number} numericId
 * @property {string} name
 * @property {string?} icon
 */

/**
 * Service for reading data from IndexedDB within a service worker. This class provides
 * methods to access user preferences, contacts, and groups, supporting read-only operations
 * necessary for decrypting messages and managing sender information in notifications.
 * @class IndexedDbReader
 */
class IndexedDbReader {
  /**
   * Creates an instance of IndexedDbReader.
   * @param {string} dbName The name of the IndexedDB database.
   * @param {string} storeName The name of the store within the IndexedDB database.
   */
  constructor(dbName, storeName) {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /**
   * Opens a connection to the IndexedDB database.
   * @returns {Promise<IDBDatabase>} A promise that resolves with the IndexedDB database object.
   */
  async openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        // This should not happen in read-only mode, but it's here for completeness
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  /**
   * Retrieves an item from the IndexedDB store.
   * @param {string} key The key of the item to retrieve.
   * @returns {Promise<any>} A promise that resolves with the item's value.
   */
  async getItem(key) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Stores an item in the IndexedDB store.
   * @param {string} key The key under which the item should be stored.
   * @param {*} value The value to store; can be any type that IndexedDB supports.
   * @returns {Promise<void>} A promise that resolves when the item has been successfully stored.
   */
  async setItem(key, value) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Retrieves the user's private key from the IndexedDB store.
   * @returns {Promise<string>} A promise that resolves with the user's private key.
   */
  async getPrivateKey() {
    return this.getItem("userPrivateKey");
  }

  /**
   * Retrieves the user's public key from the IndexedDB store.
   * @returns {Promise<string>} A promise that resolves with the user's public key.
   */
  async getPublicKey() {
    return this.getItem("userPublicKey");
  }

  /**
   * Retrieves the user's contacts from the IndexedDB store.
   * @returns {Promise<Object.<string, Contact>>} A promise that resolves with the user's contacts.
   */
  async getContacts() {
    return this.getItem("contacts");
  }

  /**
   * Retrieves the user's groups from the IndexedDB store.
   * @returns {Promise<Object.<string, Group>>} A promise that resolves with the user's groups.
   */
  async getGroups() {
    return this.getItem("groups");
  }

  /**
   * Retrieves all Currency from the IndexedDB store.
   * @returns {Promise<Object.<string, Currency>>} 
   */
  async getCurrencies() {
    return this.getItem("currencies");
  }  

  /**
   * Retrieves all Blockchain from the IndexedDB store.
   * @returns {Promise<Object.<string, Blockchain>>} 
   */
  async getBlockchains() {
    return this.getItem("blockchains");
  }    

  /**
   * Sets the url with notification click query parameters, this is used when a user clicks the 
   * notification and we open the pwa through openWindow, we also attempt to pass the query parameters
   * through the openWindow but atleast on IOS when running as a PWA the queryparameters are not seen
   * when the app loads.
   * @param {string} initialDeeplink the url
   */
  setInitialDeeplink(initialDeeplink) {
    return this.setItem("initialDeeplink", initialDeeplink)
  }
}

/**
 * Initialize an instance of IndexedDbReader with the database and store name.
 * This instance is made available to be used in other parts of the service worker.
 */
const indexedDbReader = new IndexedDbReader("userDatabase", "userStore");

// Exporting the initialized IndexedDbReader instance for use in other scripts
self.indexedDbReader = indexedDbReader;
