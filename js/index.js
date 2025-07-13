import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js";
// Removed sendPasswordResetEmail import as it's no longer used for fake emails
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js"; 

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
const forgotPasswordLink = document.getElementById("forgot-password-link");

// Get modal elements
const messageModal = new bootstrap.Modal(document.getElementById('messageModal'));
const messageModalBody = document.getElementById('messageModalBody');

/**
 * Displays a message in a Bootstrap modal.
 * @param {string} message - The message to display.
 */
function showModalMessage(message) {
    messageModalBody.textContent = message;
    messageModal.show();
}

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
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
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
    });
});

// Event listener for "Forgot Password?" link
forgotPasswordLink.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("username").value;

    if (!email) {
        showModalMessage("Please enter your email address in the 'E-mail' field to simulate password reset.");
        return;
    }

    // Simulate sending a password reset email for testing purposes
    showModalMessage(`A password reset link would normally be sent to ${email}. For testing, this is a simulated message.`);
    console.log("Simulated password reset email sent to:", email);
});
