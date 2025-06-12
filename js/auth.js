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
let currentAuthUser = null; // Store the authenticated user object
let currentUserClaims = null; // Store the user's claims

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

/**
 * Updates the visibility of admin-specific UI elements (User Management link, Upload section)
 * based on the current user's claims.
 * This function is called after both authentication state is known and sidebar is loaded.
 */
function updateAdminUI() {
    // Only proceed if we have a user and their claims, and the DOM is ready for element lookup.
    if (!currentAuthUser || !currentUserClaims) {
        return;
    }

    const userLink = document.getElementById("user-management-link");
    const uploadSection = document.getElementById("upload-section");

    if (userLink) {
        if (currentUserClaims.admin) {
            userLink.classList.remove("d-none"); // Show the link
        } else {
            userLink.classList.add("d-none"); // Hide the link
        }
    } else {
        console.warn("User management link not found, ensure sidebar.html is loaded.");
    }

    if (uploadSection) {
        if (currentUserRole === "Admin" || currentUserRole === "Marketing Team") {
            uploadSection.classList.remove("d-none"); // Show the upload section
        } else {
            uploadSection.classList.add("d-none"); // Hide the upload section
        }
    } else {
        console.warn("Upload section not found.");
    }
}


// Auth & Role Check
onAuthStateChanged(auth, async (user) => {
  currentAuthUser = user; // Store the user object globally

  if (!user) {
    window.location.href = "index.html";
    currentUserRole = "Other"; // Reset role
    currentUserClaims = null; // Clear claims
    updateAdminUI(); // Hide UI elements if logged out
    return;
  }

  const name = user.displayName || user.email || "User";
  const welcomeEl = document.getElementById("welcome-message");
  if (welcomeEl) {
    welcomeEl.textContent = `Welcome, ${name}!`;
  }

  try {
    const idTokenResult = await getIdTokenResult(user);
    currentUserClaims = idTokenResult.claims; // Store claims globally

    if (currentUserClaims.admin === true) {
      currentUserRole = "Admin";
    } else if (currentUserClaims.marketingTeam === true) {
      currentUserRole = "Marketing Team";
    } else if (currentUserClaims.socialMediaManager === true) {
      currentUserRole = "Social Media Manager";
    } else {
      currentUserRole = "Other";
    }

    // After auth state and claims are determined, try to update UI
    // This will handle cases where auth resolves before sidebar loads.
    updateAdminUI();

  } catch (error) {
    console.error("Error retrieving role claims:", error);
    currentUserRole = "Other"; // Default role on error
    currentUserClaims = null; // Clear claims on error
    updateAdminUI(); // Ensure UI is hidden if claims fail
  }
});

// Listen for the custom event dispatched by loadSidebar.js
// This ensures that `updateAdminUI` is called once the sidebar elements are in the DOM.
document.addEventListener('sidebarLoaded', () => {
    // If auth state has already been determined, update UI immediately.
    // Otherwise, `onAuthStateChanged` will eventually call updateAdminUI.
    if (currentAuthUser) {
        updateAdminUI();
    }
});
