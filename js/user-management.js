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

let currentUserUid = null;
let currentUserToken = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        currentUserUid = user.uid;
        currentUserToken = await getIdToken(user, true);
        await fetchUsers(currentUserToken);
    }
});

window.logout = () => {
    signOut(auth)
        .then(() => {
            window.location.href = "index.html";
        })
        .catch((error) => {
            alert("Logout error: " + error.message);
        });
};

async function fetchUsers(token) {
    try {
        const response = await fetch("http://localhost:5000/api/users", {
            headers: { Authorization: token }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to fetch users");
        }
        const users = await response.json();
        populateUserTable(users);
    } catch (error) {
        alert("Error loading users: " + error.message);
        console.error("Error loading users:", error.message);
    }
}

function populateUserTable(users) {
    const tbody = document.querySelector("#users-table tbody");
    tbody.innerHTML = "";

    users.forEach(user => {
        const tr = document.createElement("tr");
        tr.dataset.uid = user.uid;

        // Roles checkboxes
        const roles = user.custom_claims || {};
        const isAdmin = !!roles.admin;
        const isUploader = !!roles.uploader;
        const isViewer = !!roles.viewer;

        tr.innerHTML = `
            <td>${user.email}</td>
            <td><input type="text" class="form-control form-control-sm display-name-input" value="${user.display_name || ''}" /></td>
            <td>
                <div class="form-check form-check-inline">
                    <input class="form-check-input admin-checkbox" type="checkbox" ${isAdmin ? "checked" : ""} />
                    <label class="form-check-label">Admin</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input uploader-checkbox" type="checkbox" ${isUploader ? "checked" : ""} />
                    <label class="form-check-label">Uploader</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input viewer-checkbox" type="checkbox" ${isViewer ? "checked" : ""} />
                    <label class="form-check-label">Viewer</label>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-success me-2 save-btn">Save</button>
                <button class="btn btn-sm btn-danger delete-btn">Delete</button>
            </td>
        `;

        // Disable delete button if this is the current logged in user
        if (user.uid === currentUserUid) {
            tr.querySelector(".delete-btn").disabled = true;
        }

        tbody.appendChild(tr);
    });

    // Attach event listeners for save and delete buttons
    attachTableEventListeners();
}

function attachTableEventListeners() {
    document.querySelectorAll(".save-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const tr = e.target.closest("tr");
            await saveUserChanges(tr);
        };
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const tr = e.target.closest("tr");
            if (confirm("Are you sure you want to delete this user?")) {
                await deleteUser(tr.dataset.uid);
            }
        };
    });
}

async function saveUserChanges(tr) {
    const uid = tr.dataset.uid;
    const displayName = tr.querySelector(".display-name-input").value.trim();

    const roles = {
        admin: tr.querySelector(".admin-checkbox").checked,
        uploader: tr.querySelector(".uploader-checkbox").checked,
        viewer: tr.querySelector(".viewer-checkbox").checked,
    };

    // If no roles are checked, clear claims by sending empty object or null
    const hasAnyRole = Object.values(roles).some(v => v === true);
    const claimsToSend = hasAnyRole ? roles : {};

    try {
        const response = await fetch(`http://localhost:5000/api/users/${uid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: currentUserToken
            },
            body: JSON.stringify({
                display_name: displayName,
                roles: claimsToSend
            })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to update user");
        }
        alert("User updated successfully.");
    } catch (error) {
        alert("Error updating user: " + error.message);
        console.error("Error updating user:", error.message);
    }
}

async function deleteUser(uid) {
    try {
        const response = await fetch(`http://localhost:5000/api/users/${uid}`, {
            method: "DELETE",
            headers: { Authorization: currentUserToken }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to delete user");
        }
        alert("User deleted successfully.");
        await fetchUsers(currentUserToken); // Refresh user list
    } catch (error) {
        alert("Error deleting user: " + error.message);
        console.error("Error deleting user:", error.message);
    }
}

// Add User Modal creation and logic

// Create modal DOM elements dynamically
const modalHTML = `
<div class="modal fade" id="addUserModal" tabindex="-1" aria-labelledby="addUserModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <form id="addUserForm" class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="addUserModalLabel">Add New User</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
          <div class="mb-3">
              <label for="newUserEmail" class="form-label">Email</label>
              <input type="email" class="form-control" id="newUserEmail" required />
          </div>
          <div class="mb-3">
              <label for="newUserPassword" class="form-label">Password</label>
              <input type="password" class="form-control" id="newUserPassword" required minlength="6" />
          </div>
          <div class="mb-3">
              <label for="newUserDisplayName" class="form-label">Display Name</label>
              <input type="text" class="form-control" id="newUserDisplayName" />
          </div>
          <div class="mb-3">
              <label>Roles</label><br/>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" id="newUserAdmin" />
                <label class="form-check-label" for="newUserAdmin">Admin</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" id="newUserUploader" />
                <label class="form-check-label" for="newUserUploader">Uploader</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" id="newUserViewer" />
                <label class="form-check-label" for="newUserViewer">Viewer</label>
              </div>
          </div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn btn-primary">Create User</button>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      </div>
    </form>
  </div>
</div>
`;

// Append modal to body
document.body.insertAdjacentHTML('beforeend', modalHTML);

// Bootstrap 5 modal instance
const addUserModal = new bootstrap.Modal(document.getElementById('addUserModal'));

// Open modal function
window.openCreateUserModal = () => {
    clearAddUserForm();
    addUserModal.show();
};

function clearAddUserForm() {
    document.getElementById('addUserForm').reset();
}

// Handle form submit
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const displayName = document.getElementById('newUserDisplayName').value.trim();

    const roles = {
        admin: document.getElementById('newUserAdmin').checked,
        uploader: document.getElementById('newUserUploader').checked,
        viewer: document.getElementById('newUserViewer').checked,
    };

    // Basic validation
    if (!email || !password) {
        alert("Email and password are required.");
        return;
    }

    try {
        const response = await fetch("http://localhost:5000/api/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: currentUserToken
            },
            body: JSON.stringify({
                email,
                password,
                display_name: displayName,
                roles
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to create user");
        }

        alert("User created successfully.");
        addUserModal.hide();
        await fetchUsers(currentUserToken);
    } catch (error) {
        alert("Error creating user: " + error.message);
        console.error("Error creating user:", error.message);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const userLink = document.getElementById("user-management-link");
    if (window.location.pathname.endsWith("user-management.html")) {
        userLink.classList.add("active");
    }
});
