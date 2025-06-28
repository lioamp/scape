import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  getIdTokenResult,
  signInWithEmailAndPassword,
  sendPasswordResetEmail // Added for forgot password functionality
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
    console.warn("Firebase app already initialized. Skipping re-initialization.");
    app = firebase.app(); // Get the existing app
}

const auth = getAuth(app); // Get the auth instance

// Global references for Bootstrap modals
let customAlertModalInstance = null;
let forgotPasswordModalInstance = null;

// Helper function to show a custom alert modal (re-used across the app)
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');
    if (!modalElement) {
        console.error("Custom alert modal element not found in the DOM.");
        // Fallback to native alert if modal element is missing, though this should be avoided.
        alert(`${title}: ${message}`); 
        return;
    }

    if (!customAlertModalInstance) {
        customAlertModalInstance = new bootstrap.Modal(modalElement);
    }

    const modalTitle = document.getElementById('customAlertModalLabel');
    const modalBody = document.getElementById('customAlertModalBody');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    customAlertModalInstance.show();
}

/**
 * Shows or hides the loading overlay for the forgot password modal.
 * @param {boolean} show True to show loading overlay, false to hide.
 */
function showForgotPasswordLoadingOverlay(show) {
    const overlay = document.getElementById('forgotPasswordLoadingOverlay');
    const formButtons = document.querySelector('#forgotPasswordForm .d-flex.justify-content-end');
    if (overlay && formButtons) {
        if (show) {
            overlay.classList.remove('d-none');
            formButtons.classList.add('d-none'); // Hide buttons while loading
        } else {
            overlay.classList.add('d-none');
            formButtons.classList.remove('d-none'); // Show buttons after loading
        }
    } else {
        console.warn("Forgot password loading overlay or form buttons not found.");
    }
}


/**
 * Sends a password reset email to the provided email address.
 * @param {string} email The email address to send the reset link to.
 */
async function handlePasswordReset(email) {
    showForgotPasswordLoadingOverlay(true); // Show loading spinner
    try {
        await sendPasswordResetEmail(auth, email);
        showCustomAlert("A password reset link has been sent to your email address. Please check your inbox (and spam folder).", "Password Reset Sent");
        logActivity("PASSWORD_RESET_INITIATED", `Password reset email sent to ${email}`);
        // Ensure forgotPasswordModalInstance is defined before trying to hide it
        if (forgotPasswordModalInstance) {
            forgotPasswordModalInstance.hide(); // Close the modal on success
        }
    } catch (error) {
        let errorMessage = "Failed to send password reset email. Please try again.";
        console.error("Error sending password reset email:", error);
        logActivity("PASSWORD_RESET_FAILED", `Failed to send password reset email to ${email}: ${error.message}`);
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = "No user found with that email address.";
                break;
            case 'auth/invalid-email':
                errorMessage = "The email address is not valid.";
                break;
            case 'auth/too-many-requests':
                errorMessage = "Too many requests. Please try again later.";
                break;
            default:
                // Generic error, usually safe to show this
                errorMessage = error.message; 
                break;
        }
        showCustomAlert(errorMessage, "Password Reset Error");
    } finally {
        showForgotPasswordLoadingOverlay(false); // Hide loading spinner
    }
}


// Function to log user activity to your Flask backend
export async function logActivity(action, details = '') {
    // Check if currentUserToken is available, which indicates a logged-in user
    // This token is set by the onAuthStateChanged listener below.
    const token = window.currentUserToken; 

    // Only log activity if there's a token (user is authenticated)
    // or if the action is related to authentication itself (e.g., login success/failure)
    // You might adjust this logic if you want to log unauthenticated actions.
    if (!token && action !== "LOGIN_SUCCESS" && action !== "LOGIN_FAILED" && action !== "PASSWORD_RESET_INITIATED" && action !== "PASSWORD_RESET_FAILED") {
        console.warn("Attempted to log activity without an authentication token for action:", action);
        return; 
    }

    try {
        const response = await fetch(`${API_BASE_URL}/log_activity`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Only send Authorization header if a token exists
                ...(token && { 'Authorization': `Bearer ${token}` }) 
            },
            body: JSON.stringify({ action, details })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to log activity: ${response.status} - ${errorText}`);
        } else {
            // console.log(`Activity logged: ${action}`); // Keep this for debugging if needed
        }
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}


// Listen for authentication state changes
onAuthStateChanged(auth, async (user) => {
    const userDisplayNameElement = document.getElementById('userDisplayName');
    const userRoleElement = document.getElementById('userRole');
    const loginLogoutLink = document.getElementById('loginLogoutLink');
    const userManagementLink = document.getElementById('userManagementLink');
    const uploadSection = document.getElementById('uploadSection');
    const activityLogLink = document.getElementById('activityLogLink');
    // Corrected ID to match the new span in dashboard's index.html
    const welcomeMessageElement = document.getElementById('welcomeMessage'); 

    if (user) {
        // User is signed in
        window.currentUserToken = await user.getIdToken(); // Make token globally available
        const idTokenResult = await user.getIdTokenResult();
        const currentUserClaims = idTokenResult.claims;
        const currentUserRole = currentUserClaims.admin ? "Admin" :
                                currentUserClaims['Marketing Team'] ? "Marketing Team" :
                                currentUserClaims['Social Media Manager'] ? "Social Media Manager" :
                                "User"; // Default role if no specific claim

        // Redirect to dashboard if on login page
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            window.location.href = '/dashboard.html';
        }

        // Update UI for logged-in state
        // These are typically for the sidebar/header if present globally
        if (userDisplayNameElement) userDisplayNameElement.textContent = user.displayName || user.email;
        if (userRoleElement) userRoleElement.textContent = currentUserRole;
        if (loginLogoutLink) {
            loginLogoutLink.textContent = "Logout";
            loginLogoutLink.href = "#"; // Prevent navigation on logout click
            loginLogoutLink.onclick = async (e) => {
                e.preventDefault();
                try {
                    await signOut(auth);
                    logActivity("LOGOUT", `User ${user.email} logged out.`);
                    // Redirect to login page after logout
                    window.location.href = '/'; 
                } catch (error) {
                    console.error("Error signing out:", error);
                    showCustomAlert("Error logging out. Please try again.", "Logout Error");
                }
            };
        }
        // Update welcome message if element exists
        if (welcomeMessageElement) {
            const displayUserName = user.displayName || user.email.split('@')[0];
            welcomeMessageElement.textContent = `Welcome ${displayUserName}!`;
        }

        // Update admin UI based on claims after sidebar is loaded
        // This relies on loadSidebar.js dispatching 'sidebarLoaded' event
        updateAdminUI(currentUserClaims, currentUserRole);

    } else {
        // User is signed out
        window.currentUserToken = null; // Clear global token
        // Redirect to login page if not already there
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.location.href = '/';
        }
        // Update UI for logged-out state (if elements exist on the login page)
        if (loginLogoutLink) {
            loginLogoutLink.textContent = "Login";
            loginLogoutLink.href = "/";
            loginLogoutLink.onclick = null; // Remove handler to prevent conflicts
        }
        // Hide admin-specific links when logged out
        updateAdminUI({}, "Guest"); // Pass empty claims and guest role

        // Reset welcome message on logout or if not logged in on dashboard
        if (welcomeMessageElement) {
            welcomeMessageElement.textContent = ''; // Clear the welcome message
        }
    }
});

// Function to update UI elements based on user roles (Admin, Marketing Team, etc.)
function updateAdminUI(currentUserClaims, currentUserRole) {
    const userManagementLink = document.getElementById('userManagementLink');
    const uploadSection = document.getElementById('uploadSection');
    const activityLogLink = document.getElementById('activityLogLink'); // Get the activity log link

    if (userManagementLink) {
        if (currentUserClaims.admin) { // Check for 'admin' custom claim
            userManagementLink.classList.remove("d-none"); // Show the link
        } else {
            userManagementLink.classList.add("d-none"); // Hide the link
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
    if (auth.currentUser) {
        auth.currentUser.getIdTokenResult().then(idTokenResult => {
            const currentUserClaims = idTokenResult.claims;
            const currentUserRole = currentUserClaims.admin ? "Admin" :
                                    currentUserClaims['Marketing Team'] ? "Marketing Team" :
                                    currentUserClaims['Social Media Manager'] ? "Social Media Manager" :
                                    "User";
            updateAdminUI(currentUserClaims, currentUserRole);
            
            // Also update the welcome message if the element exists
            const welcomeMessageElement = document.getElementById('welcomeMessage');
            if (welcomeMessageElement) {
                const displayUserName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];
                welcomeMessageElement.textContent = `Welcome ${displayUserName}!`;
            }
        });
    } else {
        // User is not logged in, update UI to reflect guest state
        updateAdminUI({}, "Guest");
        const welcomeMessageElement = document.getElementById('welcomeMessage');
        if (welcomeMessageElement) {
            welcomeMessageElement.textContent = ''; // Clear welcome message if not logged in
        }
    }
});


// Add event listener for the login form (assuming this part is for the login page)
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                logActivity("LOGIN_SUCCESS", `User ${user.email} logged in successfully.`);
                // onAuthStateChanged will handle redirection
            } catch (error) {
                console.error("Login Error:", error.code, error.message);
                logActivity("LOGIN_FAILED", `Login failed for ${email}: ${error.message}`);
                let errorMessage = "Login failed. Please check your credentials.";
                switch (error.code) {
                    case 'auth/invalid-email':
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = "Invalid email or password.";
                        break;
                    case 'auth/user-disabled':
                        errorMessage = "Your account has been disabled.";
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = "Too many failed login attempts. Please try again later.";
                        break;
                }
                showCustomAlert(errorMessage, "Login Error");
            }
        });
    } else {
        // This block likely runs on pages other than the login page.
        // The welcome message update is handled by onAuthStateChanged directly.
    }

    // Initialize forgotPasswordModalInstance
    const forgotPasswordModalElement = document.getElementById('forgotPasswordModal');
    if (forgotPasswordModalElement) {
        forgotPasswordModalInstance = new bootstrap.Modal(forgotPasswordModalElement);
    }

    // Add event listener for the forgot password form submission
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotPasswordEmail').value;
            if (email) {
                await handlePasswordReset(email);
            } else {
                showCustomAlert("Please enter your email address.", "Input Required");
            }
        });
    }
});
