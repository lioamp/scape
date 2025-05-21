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

// Redirect if not authenticated
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// Logout function exposed globally
window.logout = () => {
  signOut(auth)
    .then(() => {
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Logout error:", error.message);
    });
};

// Show/hide visualization sections
window.showVisualization = (type) => {
  document.querySelectorAll(".visualization").forEach((div) => {
    div.classList.add("d-none");
  });

  const selected = document.getElementById(type);
  if (selected) {
    selected.classList.remove("d-none");
  }
};

// Highlight active sidebar link on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const perfLink = document.getElementById("performance-link");
  if (window.location.pathname.endsWith("performance-evaluation.html")) {
    perfLink.classList.add("active");
  }
});
