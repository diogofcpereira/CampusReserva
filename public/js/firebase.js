import {
    initializeApp,
    getApps,
    getApp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCHeWE5G8S95G0XzNRlussdIn9jt0q8i7o",
    authDomain: "campusreservage.firebaseapp.com",
    projectId: "campusreservage",
    storageBucket: "campusreservage.firebasestorage.app",
    messagingSenderId: "834601060186",
    appId: "1:601060186:web:877fe843714f16b8f85563"
};

const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };