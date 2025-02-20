importScripts("./firebasejs/firebase-app-compat.js");
importScripts("./firebasejs/firebase-messaging-compat.js");

/* force file update = 1 */

self.WEB_APP_URL = 'https://app.heatwallet.com';
// self.WEB_APP_URL = 'https://tulipfox.ngrok.app/';

firebase.initializeApp({
  apiKey: "AIzaSyAtgxdQDe0B5a6wiM_kwqzlbgqr-8OWLes",
  authDomain: "heat-app-a0626.firebaseapp.com",
  projectId: "heat-app-a0626",
  storageBucket: "heat-app-a0626.appspot.com",
  messagingSenderId: "435820599686",
  appId: "1:435820599686:web:5b3b7658489ce8d49bf407",
  measurementId: "G-VKLW787VP4",
});

importScripts("service-worker-handlers.js");