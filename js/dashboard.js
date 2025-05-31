import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCyIr7hWhROGodkcsMJC9n4sEuDOR5NGww",
  authDomain: "scape-login.firebaseapp.com",
  projectId: "scape-login",
  storageBucket: "scape-login.firebasestorage.app",
  messagingSenderId: "410040228789",
  appId: "1:410040228789:web:5b9b4b32e91c5549ab17fc",
  measurementId: "G-GBNRL156FJ",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Check if user is authenticated and get role
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const name = user.displayName || user.email || "User";
  const welcomeEl = document.getElementById("welcome-message");
  if (welcomeEl) {
    welcomeEl.textContent = `Welcome, ${name}!`;
  }

  try {
    const idTokenResult = await getIdTokenResult(user);
    const claims = idTokenResult.claims;

    // Show "Users" tab only if admin
    const userLink = document.getElementById("user-management-link");
    if (claims.admin && userLink) {
      userLink.classList.remove("d-none");
    } else if (userLink) {
      userLink.classList.add("d-none");
    }

    // Future role-specific logic:
    // if (claims.marketing_team) { /* enable upload features */ }
    // if (claims.socmed_team) { /* restrict upload features */ }

  } catch (error) {
    console.error("Error getting token claims:", error);
  }
});

// Logout
window.logout = () => {
  signOut(auth)
    .then(() => {
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Logout error:", error.message);
    });
};

// Highlight dashboard link
document.addEventListener("DOMContentLoaded", () => {
  const dashboardLink = document.getElementById("dashboard-link");
  if (window.location.pathname.endsWith("dashboard.html")) {
    dashboardLink.classList.add("active");
  }
});
