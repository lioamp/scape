import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, getIdToken } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { logActivity } from "/js/auth.js"; // Import the logActivity function

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
let currentUserToken = null; // This holds just the ID token string

// Helper for custom alerts (since this file doesn't import a shared utility)
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');
    const modalTitle = document.getElementById('customAlertModalLabel');
    const modalBody = document.getElementById('customAlertModalBody');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    } else {
        console.error("Custom alert modal element not found in the DOM.");
        alert(`${title}: ${message}`); 
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/"; // Redirect to root/login page
    } else {
        currentUserUid = user.uid;
        currentUserToken = await getIdToken(user, true); 
        await fetchUsers(currentUserToken);
        logActivity("PAGE_VIEW", "Viewed User Management page."); // Log page view
    }
});

// The window.logout function is now defined in auth.js and globally available, so removed from here.

async function fetchUsers(token) {
    try {
        const response = await fetch("http://localhost:5000/api/users", {
            headers: { Authorization: `Bearer ${token}` } 
        });
        if (!response.ok) {
            let errorMessage = "Failed to fetch users";
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || `HTTP error! Status: ${response.status}`;
            } catch (jsonError) {
                errorMessage = `HTTP error! Status: ${response.status}. Could not parse error response.`;
                console.error("Error parsing backend error response:", jsonError);
            }
            logActivity("USER_LIST_FETCH_FAILED", `Failed to fetch user list: ${errorMessage}`); // Log failure
            showCustomAlert("Error loading users: " + errorMessage, "Error"); // Use custom alert
            throw new Error(errorMessage);
        }
        const users = await response.json();
        populateUserTable(users);
        logActivity("USER_LIST_FETCH_SUCCESS", "Successfully fetched user list."); // Log success
    } catch (error) {
        console.error("Error loading users:", error.message);
        // The error is already logged above if it's an API error, otherwise a general client error
    }
}

function getUserRole(custom_claims) {
    if (!custom_claims) return null;
    if (custom_claims.admin) return "admin";
    if (custom_claims.marketingTeam) return "marketingTeam";
    if (custom_claims.socialMediaManager) return "socialMediaManager";
    return null;
}

function populateUserTable(users) {
    const tbody = document.querySelector("#users-table tbody");
    tbody.innerHTML = "";

    const currentUserData = users.find(u => u.uid === currentUserUid);
    const currentUserRole = getUserRole(currentUserData?.custom_claims) || "";

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
                    <input class="form-check-input" type="radio" name="role_${user.uid}" id="marketingTeam_${user.uid}" value="marketingTeam" ${role === "marketingTeam" ? "checked" : ""} />
                    <label class="form-check-label" for="marketingTeam_${user.uid}">Marketing Team</label>
                </div>
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="role_${user.uid}" id="socialMediaManager_${user.uid}" value="socialMediaManager" ${role === "socialMediaManager" ? "checked" : ""} />
                    <label class="form-check-label" for="socialMediaManager_${user.uid}">Social Media Manager</label>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-success me-2 save-btn">Save</button>
                <button class="btn btn-sm btn-danger delete-btn">Delete</button>
            </td>
        `;

        const deleteBtn = tr.querySelector(".delete-btn");

        if (user.uid === currentUserUid || 
            (currentUserRole === "admin" && role === "admin" && user.uid !== currentUserUid)) {
            deleteBtn.disabled = true;
            deleteBtn.title = "Admin accounts cannot delete their own account or other Admins (if you are an Admin)."; 
        } else if (user.uid === currentUserUid) {
            deleteBtn.disabled = true;
            deleteBtn.title = "You cannot delete your own account.";
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
            const userEmail = tr.querySelector("td:first-child").textContent; // Get email for logging
            showCustomAlertWithConfirm(`Are you sure you want to delete user ${userEmail}?`, "Confirm Deletion", async () => {
                await deleteUser(tr.dataset.uid, userEmail); // Pass email for logging
            });
        };
    });
}

async function saveUserChanges(tr) {
    const uid = tr.dataset.uid;
    const email = tr.querySelector("td:first-child").textContent; // Get email for logging
    const displayName = tr.querySelector(".display-name-input").value.trim();

    const selectedRoleRadio = tr.querySelector(`input[name="role_${uid}"]:checked`);
    const selectedRole = selectedRoleRadio ? selectedRoleRadio.value : null;

    if (!selectedRole) {
        showCustomAlert("Please select a role for the user.", "Role Required");
        return;
    }

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
                Authorization: `Bearer ${currentUserToken}` 
            },
            body: JSON.stringify({
                display_name: displayName,
                roles: roles
            })
        });
        const result = await response.json();
        if (!response.ok) {
            let errorMessage = "Failed to update user";
            try {
                errorMessage = result.error || result.message || `HTTP error! Status: ${response.status}`;
            } catch (jsonError) {
                errorMessage = `HTTP error! Status: ${response.status}. Could not parse error response.`;
                console.error("Error parsing backend error response:", jsonError);
            }
            logActivity("ADMIN_USER_UPDATE_FAILED", `Admin failed to update user '${email}' (UID: '${uid}'). Error: ${errorMessage}`); // Log failure
            showCustomAlert("Error updating user: " + errorMessage, "Error");
            throw new Error(errorMessage);
        }
        showCustomAlert("User updated successfully.", "Success");
        logActivity("ADMIN_USER_UPDATED", `Admin updated user '${email}' (UID: '${uid}'). Roles: ${JSON.stringify(roles)}`); // Log success
    } catch (error) {
        console.error("Error updating user:", error.message);
        // The error is already logged above if it's an API error, otherwise a general client error
    }
}

async function deleteUser(uid, email) { // Added email parameter
    try {
        const response = await fetch(`http://localhost:5000/api/users/${uid}`, {
            method: "DELETE",
            headers: { 
                Authorization: `Bearer ${currentUserToken}` 
            }
        });
        const result = await response.json();
        if (!response.ok) {
            let errorMessage = "Failed to delete user";
            try {
                errorMessage = result.error || result.message || `HTTP error! Status: ${response.status}`;
            } catch (jsonError) {
                errorMessage = `HTTP error! Status: ${response.status}. Could not parse error response.`;
                console.error("Error parsing backend error response:", jsonError);
            }
            logActivity("ADMIN_USER_DELETE_FAILED", `Admin failed to delete user '${email}' (UID: '${uid}'). Error: ${errorMessage}`); // Log failure
            showCustomAlert("Error deleting user: " + errorMessage, "Error");
            throw new Error(errorMessage);
        }
        showCustomAlert("User deleted successfully.", "Success");
        logActivity("ADMIN_USER_DELETED", `Admin deleted user '${email}' (UID: '${uid}').`); // Log success
        await fetchUsers(currentUserToken); // Refresh list
    } catch (error) {
        console.error("Error deleting user:", error.message);
        // The error is already logged above if it's an API error, otherwise a general client error
    }
}

// Add User Modal HTML (remains the same)
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

// Custom alert with confirm (replaces window.confirm)
function showCustomAlertWithConfirm(message, title = 'Confirm', onConfirm) {
    const confirmModalElement = document.getElementById('customConfirmModal');
    if (!confirmModalElement) {
        // Create the custom confirm modal HTML if it doesn't exist
        const confirmModalHTML = `
            <div class="modal fade" id="customConfirmModal" tabindex="-1" aria-labelledby="customConfirmModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-sm">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="customConfirmModalLabel"></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="customConfirmModalBody"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" id="customConfirmButton">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', confirmModalHTML);
    }
    
    const modalTitle = document.getElementById('customConfirmModalLabel');
    const modalBody = document.getElementById('customConfirmModalBody');
    const confirmButton = document.getElementById('customConfirmButton');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    const modal = new bootstrap.Modal(document.getElementById('customConfirmModal'));

    // Clear previous event listener
    confirmButton.onclick = null; 
    confirmButton.onclick = () => {
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
        modal.hide();
    };
    modal.show();
}


window.openCreateUserModal = () => {
    clearAddUserForm();
    addUserModal.show();
};

function clearAddUserForm() {
    document.getElementById('addUserForm').reset();
    // Ensure default radio is checked if needed
    document.getElementById('newUserAdmin').checked = true; 
}

document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const displayName = document.getElementById('newUserDisplayName').value.trim();

    const roleRadio = document.querySelector('input[name="newUserRole"]:checked');
    const selectedRole = roleRadio ? roleRadio.value : null;

    if (!email || !password || !selectedRole) {
        showCustomAlert("Please fill all required fields and select a role.", "Input Required");
        return;
    }

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
                Authorization: `Bearer ${currentUserToken}` 
            },
            body: JSON.stringify({
                email,
                password,
                display_name: displayName,
                roles
            })
        });

        const result = await response.json();
        if (!response.ok) {
            let errorMessage = "Failed to create user";
            try {
                errorMessage = result.error || result.message || `HTTP error! Status: ${response.status}`;
            } catch (jsonError) {
                errorMessage = `HTTP error! Status: ${response.status}. Could not parse error response.`;
                console.error("Error parsing backend error response:", jsonError);
            }
            logActivity("ADMIN_USER_CREATE_FAILED", `Admin failed to create user '${email}'. Error: ${errorMessage}`); // Log failure
            showCustomAlert("Error creating user: " + errorMessage, "Error");
            throw new Error(errorMessage);
        }

        showCustomAlert("User created successfully.", "Success");
        logActivity("ADMIN_USER_CREATED", `Admin created user: '${email}' (UID: ${result.uid}). Roles: ${JSON.stringify(roles)}`); // Log success
        addUserModal.hide();
        await fetchUsers(currentUserToken); 
    } catch (error) {
        console.error("Error creating user:", error.message);
        // Error already logged above
    }
});
