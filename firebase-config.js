import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6_67MH7RSSgAH2cmSg1PPjerIX2aedoY",
  authDomain: "wass-f2673.firebaseapp.com",
  databaseURL: "https://wass-f2673-default-rtdb.firebaseio.com",
  projectId: "wass-f2673",
  storageBucket: "wass-f2673.firebasestorage.app",
  messagingSenderId: "520744387854",
  appId: "1:520744387854:web:6265fcfa45fdb892e4435f",
  measurementId: "G-NXCVHTDHMZ"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
