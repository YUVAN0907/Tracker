import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCZQjLDj2hOhEutR_YpmbEmqbEwc1j-H9E",
    authDomain: "vendbees-60d7b.firebaseapp.com",
    projectId: "vendbees-60d7b",
    storageBucket: "vendbees-60d7b.firebasestorage.app",
    messagingSenderId: "333114755202",
    appId: "1:333114755202:web:5a10d9570c565caf324c9b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "vendbeesdb");
export const storage = getStorage(app);

