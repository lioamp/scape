import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js"; // Added onAuthStateChanged

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
const analytics = getAnalytics(app);
const auth = getAuth(app);

const loginForm = document.getElementById("login-form");
const errorMessage = document.getElementById("error-message");

/**
 * Logs an activity to the backend activity log.
 * @param {string} action - A short description of the action (e.g., "USER_LOGIN").
 * @param {string} [details] - Optional more detailed information.
 */
async function logActivity(action, details = '') {
    const user = auth.currentUser;
    if (!user) {
        console.warn("Attempted to log activity, but no user is authenticated.");
        return;
    }

    try {
        const idToken = await user.getIdToken(); // Get the current ID token for authentication
        const response = await fetch('/api/log_activity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ action, details })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to log activity:', errorData.error || response.statusText);
        } else {
            console.log('Activity logged:', action);
        }
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Listen for authentication state changes to log initial page views/reloads
// This runs whenever the auth state changes (login, logout, refresh)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in. This is a good place to log a "Page View" or "App Loaded" event
        // for any page that requires authentication.
        // We'll primarily use this for initial page loads of authenticated pages.
        // For login success, we'll log it specifically in the signInWithEmailAndPassword .then()
    }
});


loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      // User successfully logged in
      const user = userCredential.user;
      console.log("User logged in:", user.uid);
      
      // Log the login activity
      logActivity("USER_LOGIN", `User '${user.email}' logged in.`);

      // Redirect to dashboard
      window.location.href = "/dashboard/"; 
    })
    .catch((error) => {
      errorMessage.textContent = error.message;
      console.error("Login failed:", error.code, error.message);
      // You could also log failed login attempts if needed
      // logActivity("LOGIN_ATTEMPT_FAILED", `Attempted login for '${email}' failed: ${error.message}`);
    });
});
