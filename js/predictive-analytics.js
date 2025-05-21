// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCyIr7hWhROGodkcsMJC9n4sEuDOR5NGww",
  authDomain: "scape-login.firebaseapp.com",
  projectId: "scape-login",
  storageBucket: "scape-login.firebasestorage.app",
  messagingSenderId: "410040228789",
  appId: "1:410040228789:web:5b9b4b32e91c5549ab17fc",
  measurementId: "G-GBNRL156FJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Redirect if user is not authenticated
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// Logout button handler
window.logout = function () {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};

// Show visualization and hide others
window.showVisualization = function (id) {
  document.querySelectorAll(".visualization").forEach((el) => el.classList.add("d-none"));
  document.getElementById(id).classList.remove("d-none");
};

// Highlight active sidebar link
document.querySelectorAll(".nav-link").forEach((link) => {
  if (link.href === window.location.href) {
    link.classList.add("active");
  } else {
    link.classList.remove("active");
  }
});
