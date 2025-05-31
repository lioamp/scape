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

function getUserRole(custom_claims) {
    // custom_claims example:
    // { admin: true } or { marketingTeam: true } or { socialMediaManager: true }
    if (!custom_claims) return null;
    if (custom_claims.admin) return "admin";
    if (custom_claims.marketingTeam) return "marketingTeam";
    if (custom_claims.socialMediaManager) return "socialMediaManager";
    return null;
}

function populateUserTable(users) {
    const tbody = document.querySelector("#users-table tbody");
    tbody.innerHTML = "";

    users.forEach(user => {
        const tr = document.createElement("tr");
        tr.dataset.uid = user.uid;

        const role = getUserRole(user.custom_claims) || "";

        tr.innerHTML = `
            <td>${user.email}</td>
            <td><input type="text" class="form-control form-control-sm display-name-input" value="${user.display_name || ''}" /></td>
            <td>
                <div class="form-check form-check-inline">
                    <input class="form-check-input role-radio" type="radio" name="role_${user.uid}" id="admin_${user.uid}" value="admin" ${role === "admin" ? "checked" : ""} />
                    <label class="form-check-label" for="admin_${user.uid}">Admin</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input role-radio" type="radio" name="role_${user.uid}" id="marketingTeam_${user.uid}" value="marketingTeam" ${role === "marketingTeam" ? "checked" : ""} />
                    <label class="form-check-label" for="marketingTeam_${user.uid}">Marketing Team</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input role-radio" type="radio" name="role_${user.uid}" id="socialMediaManager_${user.uid}" value="socialMediaManager" ${role === "socialMediaManager" ? "checked" : ""} />
                    <label class="form-check-label" for="socialMediaManager_${user.uid}">Social Media Manager</label>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-success me-2 save-btn">Save</button>
                <button class="btn btn-sm btn-danger delete-btn">Delete</button>
            </td>
        `;

        if (user.uid === currentUserUid) {
            tr.querySelector(".delete-btn").disabled = true;
        }

        tbody.appendChild(tr);
    });

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

    // Find selected role radio button value
    const selectedRoleRadio = tr.querySelector(`input[name="role_${uid}"]:checked`);
    const selectedRole = selectedRoleRadio ? selectedRoleRadio.value : null;

    if (!selectedRole) {
        alert("Please select a role for the user.");
        return;
    }

    // Construct roles object with only selected role set true
    const roles = {
        admin: false,
        marketingTeam: false,
        socialMediaManager: false
    };
    roles[selectedRole] = true;

    try {
        const response = await fetch(`http://localhost:5000/api/users/${uid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: currentUserToken
            },
            body: JSON.stringify({
                display_name: displayName,
                roles: roles
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
        await fetchUsers(currentUserToken);
    } catch (error) {
        alert("Error deleting user: " + error.message);
        console.error("Error deleting user:", error.message);
    }
}

// Add User Modal with radio buttons for roles

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
              <label>Role</label><br/>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="newUserRole" id="newUserAdmin" value="admin" required />
                <label class="form-check-label" for="newUserAdmin">Admin</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="newUserRole" id="newUserMarketingTeam" value="marketingTeam" />
                <label class="form-check-label" for="newUserMarketingTeam">Marketing Team</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="newUserRole" id="newUserSocialMediaManager" value="socialMediaManager" />
                <label class="form-check-label" for="newUserSocialMediaManager">Social Media Manager</label>
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

document.body.insertAdjacentHTML('beforeend', modalHTML);

const addUserModal = new bootstrap.Modal(document.getElementById('addUserModal'));

window.openCreateUserModal = () => {
    clearAddUserForm();
    addUserModal.show();
};

function clearAddUserForm() {
    document.getElementById('addUserForm').reset();
}

document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const displayName = document.getElementById('newUserDisplayName').value.trim();

    const roleRadio = document.querySelector('input[name="newUserRole"]:checked');
    const selectedRole = roleRadio ? roleRadio.value : null;

    if (!email || !password || !selectedRole) {
        alert("Please fill all required fields and select a role.");
        return;
    }

    // Prepare roles object with only selected role set true
    const roles = {
        admin: false,
        marketingTeam: false,
        socialMediaManager: false
    };
    roles[selectedRole] = true;

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
