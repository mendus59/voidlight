// Firebase web config for cloud saves. Paste the values from
// Firebase console > Project settings > General > Your apps > Web app > SDK setup and configuration > Config.
// These values are not secrets: Firestore security rules (firestore.rules) are what protect each player's data.
// While apiKey is still the placeholder, cloud saves stay off and the game saves to this browser only.
window.FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
