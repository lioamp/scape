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

// Global variable to store current user role
let currentUserRole = "Other";

// Make logout globally callable
window.logout = () => {
  signOut(auth)
    .then(() => {
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Logout error:", error.message);
    });
};

// Function to get the current user role (exported)
export async function getCurrentUserRole() {
  return currentUserRole;
}

// Auth & Role Check
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

    if (claims.admin === true) {
      currentUserRole = "Admin";
    } else if (claims.marketingTeam === true) {
      currentUserRole = "Marketing Team";
    } else if (claims.socialMediaManager === true) {
      currentUserRole = "Social Media Manager";
    } else {
      currentUserRole = "Other";
    }

    const userLink = document.getElementById("user-management-link");
    if (claims.admin && userLink) {
      userLink.classList.remove("d-none");
    } else if (userLink) {
      userLink.classList.add("d-none");
    }

    // Show upload button only for Admin and Marketing Team
    const uploadSection = document.getElementById("upload-section");
    if (uploadSection) {
      if (currentUserRole === "Admin" || currentUserRole === "Marketing Team") {
        uploadSection.classList.remove("d-none");
      } else {
        uploadSection.classList.add("d-none");
      }
    }

  } catch (error) {
    console.error("Error retrieving role claims:", error);
  }
});
