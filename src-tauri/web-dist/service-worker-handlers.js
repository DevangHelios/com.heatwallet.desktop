importScripts("service-worker-indexeddb.js");
importScripts("service-worker-crypto.js");

/* force file update = 1 */

(async function () {
  await indexedDbReader.setItem("someRandomKey", "someRandomValue")
})()

const firebaseMessaging = self.firebase.messaging();

/**
 * @typedef {Object} MessengerEncryptedData
 * @property {string} data - The encrypted data as a hex-encoded string.
 * @property {string} nonce - The nonce (or IV) used during encryption, hex-encoded.
 */

const cryptoHelper = {
  /**
   * Encrypts a message using the public key and the private key.
   * @param {Object} param - The encryption parameters.
   * @param {string} param.message - The plaintext message to be encrypted.
   * @param {string} param.publicKeyHex - The hex-encoded public key.
   * @param {string} param.privateKeyHex - The hex-encoded private key.
   * @returns {MessengerEncryptedData} The encrypted data and nonce.
   */
  encryptMessage: (param) => self.messengerEncryptMessage(param),
  /**
   * Decrypts a message using the public key, private key, and encrypted data.
   * @param {Object} param - The decryption parameters.
   * @param {MessengerEncryptedData} param.encryptedData - The encrypted data and nonce.
   * @param {string} param.publicKeyHex - The hex-encoded public key used for decryption.
   * @param {string} param.privateKeyHex - The hex-encoded private key used for decryption.
   * @returns {string} The decrypted plaintext message.
   */
  decryptMessage: (param) => self.messengerDecryptMessage(param),

  /**
   * Generates a public key from a given private key.
   * @param {string} privateKeyAsHex - The hex-encoded private key.
   * @returns {string} The hex-encoded public key.
   */
  getPublicKeyFromPrivateKey: (privateKeyAsHex) =>
    self.messengerGetPublicKeyFromPrivateKey(privateKeyAsHex),

  /**
   * Signs a message using the private key.
   * @param {Object} param - The signing parameters.
   * @param {string} param.privateKeyHex - The hex-encoded private key.
   * @param {string} param.message - The message to be signed.
   * @returns {string} The hex-encoded signature.
   */
  signMessage: (param) => self.messengerSignMessage(param),

  /**
   * Verifies a signature against a message and a public key.
   * @param {Object} param - The verification parameters.
   * @param {string} param.publicKeyHex - The hex-encoded public key.
   * @param {string} param.signatureHex - The hex-encoded signature.
   * @param {string} param.message - The signed message.
   * @returns {boolean} `true` if the signature is valid, otherwise `false`.
   */
  verifySignature: (param) => self.messengerVerifySignature(param),
};

const ANNOUNCE_ADDRESS = 1;
const CONNECTION_ACCEPTED = 2;
const DIRECT_MESSAGE = 3;
const REQUEST_ADDRESS = 4;
const UPDATE_TOKEN = 5;
const GROUP_MESSAGE = 6;
const INVITE_TO_GROUP = 7;
const UPDATE_GROUP_KEY = 8;
const UPDATE_METADATA = 9;
const REMOVED_FROM_GROUP = 10;
const PAYMENT_REQUEST = 11;
const CRYPTO_TRANSFER = 12;

const GROUP_DIRECT_MESSAGE = 101;
const GROUP_ADD_USER = 102;
const GROUP_REMOVE_USER = 103;
const GROUP_ADD_USERS = 104;
const GROUP_USER_UPDATE_METADATA = 105;

class PushNotificationMessage {
  /**
   * Creates the PushNotificationMessage, the type tells us where we need to navigate.
   * The identifier is the contact identifier, or group identifer or any other value to identify
   * the type.
   * @param {'contact' | 'group'} type
   * @param {*} identifier
   */
  constructor(type, identifier) {
    this.messageType = "HeatPushNotificationMessage";
    this.type = type;
    this.identifier = identifier;
  }

  // Method to convert instance to a format suitable for postMessage
  toJSON() {
    return {
      messageType: this.messageType,
      type: this.type,
      identifier: this.identifier,
    };
  }
}

// Listen to foreground messages
firebaseMessaging.onMessage((payload) => {
  console.log("onMessage", payload);
});

// Listen to background push messages
firebaseMessaging.onBackgroundMessage(async (payload) => {
  console.log("onBackgroundMessage", payload);
  const data = payload.data;
  const rpcData = tryParseRpcPayload(data);
  const decryptedRpcData = await tryDecryptRpcPayload(rpcData.payload);
  processMessage(decryptedRpcData);
});

// Listen to notification on click.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  /**
   * @type PushNotificationMessage
   */
  const pushNotificationMessage = event.notification.data;
  const queryParams = `?notification=1&type=${pushNotificationMessage.type}&identifier=${pushNotificationMessage.identifier}`;
  const appUrlWithParams = new URL(self.WEB_APP_URL + queryParams);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        console.log("windowClients", windowClients);
        await indexedDbReader.setInitialDeeplink(appUrlWithParams.href)
        for (const client of windowClients) {
          if (compareURLs(client.url, self.WEB_APP_URL)) {
            client.postMessage(pushNotificationMessage);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(appUrlWithParams.href);
        }
      })
  );
});

const compareURLs = (url1, url2) => {
  function normalizeURL(url) {
    // Create a URL object to easily manipulate parts of the URL.
    const parsedUrl = new URL(url);
    let path = parsedUrl.pathname;

    // Ensure the path ends with a slash for consistency.
    if (!path.endsWith("/")) {
      path += "/";
    }

    // Construct a normalized URL string by explicitly ignoring the hash.
    // Only origin and path are used for comparison, ignoring search and hash.
    return `${parsedUrl.origin}${path}`;
  }

  // Normalize both URLs before comparison.
  const normalizedUrl1 = normalizeURL(url1);
  const normalizedUrl2 = normalizeURL(url2);

  // Compare the normalized URLs.
  return normalizedUrl1 === normalizedUrl2;
};

/**
 * The payload from the server is a JSON list
 *
 *  [0] Sender PublicKey
 *  [1] Recipient Publickey
 *  [2] Timestamp
 *  [3] Encrypted Payload
 *    [0] nonce
 *    [1] data
 *  [4] Unique message identifier as provided by the message sender
 *
 *
 * @param {Object} param
 * @returns {{
 *    controllerMessage: string,
 *    payload: {
 *      senderPublicKey: string,
 *      recipientPublicKey: string,
 *      timestamp: string,
 *      encryptedPayload: {
 *        nonce: string,
 *        data: string,
 *      }
 *      uuid: string,
 *    },
 *    timestamp: string,
 *    type: 'rpc'
 * }}
 * @throws {Error} If the payload structure is not as expected.
 */
const tryParseRpcPayload = (param) => {
  if (typeof param !== "object") {
    throw new Error("Expected 'param' to be an object.");
  }
  if (typeof param.controllerMessage !== "string") {
    throw new Error("Expected 'controllerMessage' to be a string.");
  }
  if (typeof param.payload !== "string") {
    throw new Error("Expected 'payload' to be a string.");
  }
  if (typeof param.timestamp !== "string") {
    throw new Error("Expected 'timestamp' to be a string.");
  }
  if (param.type !== "rpc") {
    throw new Error("Expected 'type' to be 'rpc'.");
  }

  const payload = JSON.parse(param.payload);
  if (!Array.isArray(payload)) {
    throw new Error("Expected 'payload' to be an array.");
  }
  if (payload.length < 5) {
    throw new Error(`Expected payload length >= 5, got ${payload.length}.`);
  }

  if (typeof payload[0] !== "string") {
    throw new Error(
      `Expected payload[0] to be a string, got ${typeof payload[0]}.`
    );
  }

  if (typeof payload[1] !== "string") {
    throw new Error(
      `Expected payload[1] to be a string, got ${typeof payload[1]}.`
    );
  }

  if (typeof payload[2] !== "number") {
    throw new Error(
      `Expected payload[2] to be a number, got ${typeof payload[2]}.`
    );
  }

  if (typeof payload[3] !== "object") {
    throw new Error(
      `Expected payload[3] to be an object, got ${typeof payload[3]}.`
    );
  } else {
    // Further validation for the encrypted payload object
    if (typeof payload[3][0] !== "string") {
      throw new Error(
        `Expected payload[3][0] (nonce) to be a string, got ${typeof payload[3][0]}.`
      );
    }
    if (typeof payload[3][1] !== "string") {
      throw new Error(
        `Expected payload[3][1] (data) to be a string, got ${typeof payload[3][1]}.`
      );
    }
  }

  if (typeof payload[4] !== "string") {
    throw new Error(
      `Expected payload[4] to be a string, got ${typeof payload[4]}.`
    );
  }

  return {
    controllerMessage: param.controllerMessage,
    payload: {
      senderPublicKey: payload[0],
      recipientPublicKey: payload[1],
      timestamp: payload[2].toString(), // Ensuring timestamp is a string as per the return annotation
      encryptedPayload: {
        nonce: payload[3][0],
        data: payload[3][1],
      },
      uuid: payload[4],
    },
    timestamp: param.timestamp,
    type: param.type,
  };
};

/**
 * @param {{
 *     senderPublicKey: string,
 *     recipientPublicKey: string,
 *     encryptedPayload: {
 *       nonce: string,
 *       data: string,
 *     }
 * }} param
 * @returns {{
 *    recipientPublicKey: string,
 *    senderPublicKey: string,
 *    ourPublicKey: string,
 *    rpcPayload: {[key: string]: any},
 * }}
 */
const tryDecryptRpcPayload = async (param) => {
  // Ignore messages coming from us
  const ourPublicKey = await indexedDbReader.getPublicKey();
  if (ourPublicKey == param.senderPublicKey) {
    return null;
  }

  // see if this message came from a Group
  // a message is from a group if we have a group whose masterPublicKey matches the senderPublicKey
  // in that case use the groups masterPrivateKey to decrypt the message
  // otherwise use the messengerPrivateKey [indexedDbReader.getPublicKey()]
  const groups = await indexedDbReader.getGroups();
  const group = groups[param.senderPublicKey];
  let privateKey;
  if (group) {
    privateKey = group.masterPrivateKey;
  } else {
    privateKey = await indexedDbReader.getPrivateKey();
  }

  const payloadAsString = cryptoHelper.decryptMessage({
    data: param.encryptedPayload.data,
    nonce: param.encryptedPayload.nonce,
    publicKeyHex: param.senderPublicKey,
    privateKeyHex: privateKey,
  });
  const rpcPayload = JSON.parse(payloadAsString);
  return {
    recipientPublicKey: param.recipientPublicKey,
    senderPublicKey: param.senderPublicKey,
    ourPublicKey,
    rpcPayload,
  };
};

/**
 * @param {{
 *    recipientPublicKey: string,
 *    senderPublicKey: string,
 *    ourPublicKey: string,
 *    rpcPayload: {[key: string]: any},
 * }} param
 */
const processMessage = async (param) => {
  try {
    const messageType = param.rpcPayload["messageType"];
    if (typeof messageType != "number") {
      throw new Error(`RpcPayload has not got a messageType`);
    }
    if (messageType == GROUP_MESSAGE) {
      await processGroupMessage(param);
    } else {
      await processContactMessage(param);
    }
  } catch (e) {
    console.error(e);
  }
};

/**
 * @param {{
 *    recipientPublicKey: string,
 *    senderPublicKey: string,
 *    ourPublicKey: string,
 *    rpcPayload: {[key: string]: any},
 * }} param
 */
const processGroupMessage = async (param) => {
  const masterPublicKey = param.recipientPublicKey;
  const groups = await indexedDbReader.getGroups();
  const group = groups[masterPublicKey];
  if (!group) {
    throw new Error(
      `Group not found for given Master Public Key [${masterPublicKey}]`
    );
  }
  const keyVersion = param.rpcPayload["keyVersion"];
  if (!group.sessionKeys[`${keyVersion}`]) {
    throw new Error(
      `Session private key not found for key version [${keyVersion}]`
    );
  }

  const sessionPrivateKey = group.sessionKeys[keyVersion];
  const groupMessage = await decryptAndVerifyGroupMessage(
    param,
    sessionPrivateKey
  );
  if (groupMessage == null) {
    return;
  }

  const { senderPublicKey, rpcGroupPayload } = groupMessage;
  const member = group.members[senderPublicKey];
  const memberUserName = member ? member.userName : "unknown";

  const groupMessageType = rpcGroupPayload["messageType"];
  if (groupMessageType == GROUP_DIRECT_MESSAGE) {
    const messageContents = rpcGroupPayload["message"];
    const title = `\uD83D\uDD14 ${group.groupName}/@${memberUserName}`;
    const options = {
      body: messageContents,
      data: new PushNotificationMessage("group", masterPublicKey).toJSON(),
      priority: 'high',
      timestamp: Date.now(),
    };
    registration.showNotification(title, options);
  }
};

/**
 * @param {{
 *    recipientPublicKey: string,
 *    senderPublicKey: string,
 *    ourPublicKey: string,
 *    rpcPayload: {[key: string]: any},
 * }} param
 */
const processContactMessage = async (param) => {
  const contacts = await indexedDbReader.getContacts();
  const contact = contacts[param.senderPublicKey];
  if (!contact) {
    throw new Error(
      `No Contact found for publicKey [${param.senderPublicKey}]`
    );
  }

  const messageType = param.rpcPayload["messageType"];
  if (messageType == ANNOUNCE_ADDRESS) {
    const { address, publicKey } = param.rpcPayload;
    const blockchains = await indexedDbReader.getBlockchains();
    if (!blockchains) {
      throw new Error(`No blockchains in IndexedDB`);
    }

    const id = `chain:${param.rpcPayload.blockchain}`;
    const blockchain = blockchains[id];
    if (!blockchain) {
      throw new Error(`Could not find blockchain [${id}]`);
    }

    const title = `@${contact.contactName} sends ${blockchain.symbol} address`;
    const options = {
      body: `${blockchain.name}\n${address}`,
      data: new PushNotificationMessage(
        "contact",
        param.senderPublicKey
      ).toJSON(),
      icon: blockchain.icon,
      priority: 'high',
      timestamp: Date.now(),      
    };
    registration.showNotification(title, options);
  } else if (messageType == DIRECT_MESSAGE) {
    const { message } = param.rpcPayload;
    const title = `\uD83D\uDD14 @${contact.contactName}`;
    const options = {
      body: message,
      data: new PushNotificationMessage(
        "contact",
        param.senderPublicKey
      ).toJSON(),
      priority: 'high',
      timestamp: Date.now(),      
    };
    registration.showNotification(title, options);
  } else if (messageType == REQUEST_ADDRESS) {
    const { textContent } = param.rpcPayload;
    const blockchains = await indexedDbReader.getBlockchains();
    if (!blockchains) {
      throw new Error(`No blockchains in IndexedDB`);
    }

    const id = `chain:${param.rpcPayload.blockchain}`;
    const blockchain = blockchains[id];
    if (!blockchain) {
      throw new Error(`Could not find blockchain [${id}]`);
    }

    const title = `\uD83D\uDD14 @${contact.contactName} requests your ${blockchain.name} address`;
    const options = {
      body: `${textContent}`,
      data: new PushNotificationMessage(
        "contact",
        param.senderPublicKey
      ).toJSON(),
      icon: blockchain.icon,
      priority: 'high',
      timestamp: Date.now(),      
    };
    registration.showNotification(title, options);
  } else if (messageType == PAYMENT_REQUEST) {
    const { blockchain, assetType, assetId, address, amount, message } =
      param.rpcPayload;
    const currencies = await indexedDbReader.getCurrencies();
    if (!currencies) {
      throw new Error(`No currencies in IndexedDB`);
    }

    const currency = Object.values(currencies).find(
      (currency) =>
        currency.blockchain == blockchain &&
        currency.assetType == assetType &&
        currency.assetId == assetId
    );
    if (!currency) {
      throw new Error(
        `Could not find currency [${blockchain}-${assetType}-${assetId}]`
      );
    }

    const title = `\uD83D\uDD14 @${contact.contactName} requests a payment`;
    const options = {
      body: `Please pay ${amount} ${currency.symbol}\n${message}`,
      data: new PushNotificationMessage(
        "contact",
        param.senderPublicKey
      ).toJSON(),
      icon: blockchain.icon,
      priority: 'high',
      timestamp: Date.now(),      
    };
    registration.showNotification(title, options);
  }
};

/**
 * @param {{
 *    recipientPublicKey: string,
 *    senderPublicKey: string,
 *    ourPublicKey: string,
 *    rpcPayload: {[key: string]: any},
 * }} param
 * @param {string} sessionPrivateKey
 * @returns {{
 *    senderPublicKey: string,
 *    rpcGroupPayload: string,
 * }}
 */
const decryptAndVerifyGroupMessage = async (param, sessionPrivateKey) => {
  const sessionPublicKey =
    cryptoHelper.getPublicKeyFromPrivateKey(sessionPrivateKey);
  const [nonce, data] = JSON.parse(param.rpcPayload["encryptedPayload"]);
  const payloadAsString = cryptoHelper.decryptMessage({
    data: data,
    nonce: nonce,
    publicKeyHex: sessionPublicKey,
    privateKeyHex: sessionPrivateKey,
  });
  const rpcGroupData = JSON.parse(payloadAsString);
  if (
    !(
      Array.isArray(rpcGroupData) &&
      typeof rpcGroupData[0] == "string" &&
      typeof rpcGroupData[1] == "string" &&
      typeof rpcGroupData[2] == "string" &&
      typeof rpcGroupData[3] == "number"
    )
  ) {
    throw new Error(`Invalid Rpc Group Data`);
  }

  const senderPublicKey = rpcGroupData[0];
  const signature = rpcGroupData[1];
  const rpcGroupPayloadJsonString = rpcGroupData[2];
  const timestamp = rpcGroupData[3];
  const digest = `${rpcGroupPayloadJsonString}:${timestamp}`;
  const isVerified = cryptoHelper.verifySignature({
    publicKeyHex: senderPublicKey,
    signatureHex: signature,
    message: digest,
  });
  if (!isVerified) {
    throw new Error(`Could not verify group message signature`);
  }

  const messageComesFromUs = senderPublicKey == param.ourPublicKey;
  if (messageComesFromUs) {
    // This is a group message from us, dont show a notification.
    return null;
  }

  const rpcGroupPayload = JSON.parse(rpcGroupPayloadJsonString);
  if (typeof rpcGroupPayload["messageType"] != "number") {
    throw new Error(`Group message payload is missing "messageType"`);
  }

  return {
    senderPublicKey,
    rpcGroupPayload,
  };
};
