import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, getIdToken } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

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

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        const token = await getIdToken(user, true);
        fetchUsers(token);
    }
});

window.logout = () => {
    signOut(auth)
        .then(() => {
            window.location.href = "index.html";
        })
        .catch((error) => {
            console.error("Logout error:", error.message);
        });
};

async function fetchUsers(token) {
    try {
        const response = await fetch("http://localhost:5000/api/users", {
            headers: {
                Authorization: token
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to fetch users");
        }

        const users = await response.json();
        populateUserTable(users);
    } catch (error) {
        console.error("Error loading users:", error.message);
    }
}

function populateUserTable(users) {
    const tbody = document.querySelector("#users-table tbody");
    tbody.innerHTML = "";

    users.forEach((user) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${user.email}</td>
            <td>${user.display_name || ""}</td>
            <td>${user.custom_claims?.admin ? "Yes" : "No"}</td>
            <td>
                <button class="btn btn-sm btn-warning me-2" disabled>Edit</button>
                <button class="btn btn-sm btn-danger" disabled>Delete</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

window.openCreateUserModal = () => {
    alert("User creation form coming soon.");
};

document.addEventListener("DOMContentLoaded", () => {
    const userLink = document.getElementById("user-management-link");
    if (window.location.pathname.endsWith("user-management.html")) {
        userLink.classList.add("active");
    }
});
