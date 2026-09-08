const { initializeApp } = require("firebase/app");
const { getDatabase } = require("firebase/database");

const firebaseConfig = {
    apiKey: "AIzaSyC_IQrwsnZOLiKKXWp2yHhhHcSUpvfFUpU",
    authDomain: "domny-b8498.firebaseapp.com",
    // Adding the databaseURL explicitly for Realtime Database
    databaseURL: "https://domny-b8498-default-rtdb.firebaseio.com",
    projectId: "domny-b8498",
    storageBucket: "domny-b8498.firebasestorage.app",
    messagingSenderId: "1080282042088",
    appId: "1:1080282042088:web:00b19e8f20ecd874d3835d",
    measurementId: "G-ZBG2PWWKGY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

module.exports = { db };