import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Define the base URL for your Flask API backend
// IMPORTANT: Ensure your Flask app is running on this port (5000 by default)
const API_BASE_URL = "http://127.0.0.1:5000/api"; 

// Ensure firebaseConfig is accessible if auth.js is loaded standalone
const firebaseConfig = {
    apiKey: "AIzaSyCyIr7hWhROGodkcsMJC9n4sEuDOR5NGww",
    authDomain: "scape-login.firebaseapp.com",
    projectId: "scape-login",
    storageBucket: "scape-login.firebasestorage.app",
    messagingSenderId: "410040228789",
    appId: "1:410040228789:web:5b9b4b32e91c5549ab17fc",
    measurementId: "G-GBNRL156FJ"
};

// Initialize Firebase app if not already initialized
let app;
try {
    app = initializeApp(firebaseConfig);
} catch (e) {
    // If the app is already initialized, use the existing instance
    // In a browser environment, firebase.app() is usually correct here.
    app = firebase.app(); 
}

// EXPORT THE AUTH INSTANCE SO OTHER MODULES CAN IMPORT IT
export const auth = getAuth(app); // <-- ADD 'export' HERE

// Global variable to store current user role and token
let currentUserRole = "Other";
let currentAuthUser = null; // Store the authenticated user object
let currentUserClaims = null; // Store the user's claims

// --- NEW: Define window.currentUserTokenPromise ---
window.currentUserTokenPromise = new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
        currentAuthUser = user; // Store the user object globally

        if (user) {
            try {
                const idTokenResult = await getIdTokenResult(user);
                currentUserClaims = idTokenResult.claims; // Store claims globally
                const token = await user.getIdToken(); // Get the actual ID token
                window.currentUserToken = token; // Also set the direct global variable

                // Determine user role based on claims
                if (currentUserClaims.admin === true) {
                    currentUserRole = "Admin";
                } else if (currentUserClaims['Marketing Team'] === true) { // Changed to bracket notation
                    currentUserRole = "Marketing Team";
                } else if (currentUserClaims['Social Media Manager'] === true) { // Changed to bracket notation
                    currentUserRole = "Social Media Manager";
                } else {
                    currentUserRole = "Other";
                }

                resolve(token);

                updateAdminUI(); 

                const tokenAvailableEvent = new CustomEvent('tokenAvailable', {
                    detail: { token: window.currentUserToken, userRole: currentUserRole }
                });
                window.dispatchEvent(tokenAvailableEvent);

            } catch (error) {
                console.error("Error retrieving role claims or ID token:", error);
                currentUserRole = "Other"; // Default role on error
                currentUserClaims = null; // Clear claims on error
                window.currentUserToken = null; // Clear token on error
                reject(error); // Reject the promise on error
                updateAdminUI(); // Ensure UI is hidden if claims fail
            }
        } else {
            // User is signed out.
            // This global onAuthStateChanged listener should NOT automatically redirect on sign out.
            // The `window.logout` function will handle the redirection after logging activity.
            currentUserRole = "Other"; // Reset role
            currentUserClaims = null; // Clear claims
            window.currentUserToken = null; // Clear token
            resolve(null); // Resolve the promise with null if no user (or an empty string if preferred)
            updateAdminUI(); // Hide UI elements if logged out
        }
    });
});
// --- END NEW ---

/**
 * Logs an activity to the backend activity log.
 * This function is defined here in auth.js and exported.
 * @param {string} action - A short description of the action (e.g., "USER_LOGIN").
 * @param {string} [details] - Optional more detailed information.
 */
export async function logActivity(action, details = '') {
    const user = auth.currentUser;
    if (!user) {
        console.warn("Attempted to log activity, but no user is authenticated.");
        return;
    }

    try {
        const idToken = await user.getIdToken(); // Get the current ID token for authentication
        // Use the defined API_BASE_URL for the fetch request
        const response = await fetch(`${API_BASE_URL}/log_activity`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ action, details })
        });

        if (!response.ok) {
            const errorData = await response.json(); // Attempt to parse JSON error even if !response.ok
            console.error('Failed to log activity:', errorData.error || response.statusText);
        } else {
            console.log('Activity logged:', action);
        }
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Make logout globally callable
window.logout = async function() { // Made async to await logActivity
    const user = auth.currentUser; // Get current user BEFORE signing out
    try {
        if (user) {
            // Log logout activity FIRST, BEFORE signing out, to ensure token is still valid for the API call
            await logActivity("USER_LOGOUT", `User '${user.email}' logged out.`);
        }
        await signOut(auth); // Sign out the user from Firebase
        console.log("User signed out successfully.");
        // Redirect to the login page (root). This is the SOLE place of redirect for logout.
        window.location.href = "/"; 
    } catch (error) {
        console.error("Error signing out:", error);
        // If there's an error signing out, still try to redirect to login page for user experience.
        window.location.href = "/"; 
    }
};

// Function to get the current user role (exported)
export async function getCurrentUserRole() {
  return currentUserRole;
}

/**
 * Updates the visibility of admin-specific UI elements (User Management link, Upload section, Activity Log link)
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
    const activityLogLink = document.getElementById("activity-log-link"); // Get the new activity log link

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
        // Here, currentUserRole is already set correctly based on the claims checked above.
        if (currentUserRole === "Admin" || currentUserRole === "Marketing Team") {
            uploadSection.classList.remove("d-none"); // Show the upload section
        } else {
            uploadSection.classList.add("d-none"); // Hide the upload section
        }
    } else {
        console.warn("Upload section not found.");
    }

    // NEW: Logic to show/hide the Activity Log link based on admin claim
    if (activityLogLink) {
        if (currentUserClaims.admin) {
            activityLogLink.classList.remove("d-none"); // Show the link if admin
        } else {
            activityLogLink.classList.add("d-none"); // Hide the link otherwise
        }
    } else {
        console.warn("Activity log link not found, ensure sidebar.html is loaded.");
    }
}

// Listen for the custom event dispatched by loadSidebar.js
// This ensures that `updateAdminUI` is called once the sidebar elements are in the DOM.
document.addEventListener('sidebarLoaded', () => {
    // If auth state has already been determined, update UI immediately.
    // Otherwise, `onAuthStateChanged` will eventually call updateAdminUI.
    if (currentAuthUser) {
        updateAdminUI();
    }
});
