import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";

import {
  getAuth,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHeWE5G8S95G0XzNRlussdIn9jt0q8i7o",
  authDomain: "campusreservage.firebaseapp.com",
  projectId: "campusreservage",
  storageBucket: "campusreservage.firebasestorage.app",
  messagingSenderId: "834601060186",
  appId: "1:601060186:web:877fe843714f16b8f85563"
};

// Em desenvolvimento (aplicação aberta em localhost) usa os emuladores locais;
// Em produção (campusreservage.web.app) usa o projeto Firebase.
const USE_FIREBASE_EMULATORS = ["localhost", "127.0.0.1"].includes(location.hostname);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (USE_FIREBASE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export { app, auth, db };
