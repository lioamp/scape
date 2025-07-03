// Import only necessary Firebase functions, as initialization is handled by auth.js
import { getAuth, onAuthStateChanged, signOut, getIdToken } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
// Import logActivity and the auth instance from auth.js
import { logActivity, auth } from "/js/auth.js"; 

// Define the base URL for your Flask API backend
const API_BASE_URL = "http://127.0.0.1:5000/api";

// currentUserUid and currentUserToken will now be populated from auth.js's promise
let currentUserUid = null;
let currentUserToken = null; 

// Bootstrap modal instances
let createUserModalInstance = null;
let editUserModalInstance = null;
let customAlertModalInstance = null;
let customConfirmModalInstance = null;


// Helper function to show a custom alert modal
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');
    if (!modalElement) {
        console.error("Custom alert modal element not found in the DOM.");
        // Fallback to native alert if modal element is missing (should not happen in production)
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

// Custom alert with confirm (replaces window.confirm)
function showCustomConfirm(message, title = 'Confirm', onConfirm) {
    const confirmModalElement = document.getElementById('customConfirmModal');
    if (!confirmModalElement) {
        // This is a fallback if the customConfirmModal is not already in index.html.
        // It's best to define this HTML directly in index.html.
        console.warn("Custom confirm modal HTML not found. Dynamically creating it. Consider adding it to index.html.");
        const confirmModalHTML = `
            <div class="modal fade" id="customConfirmModal" tabindex="-1" aria-labelledby="customConfirmModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-sm modal-dialog-centered">
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

    if (!customConfirmModalInstance) {
        customConfirmModalInstance = new bootstrap.Modal(document.getElementById('customConfirmModal'));
    }
    
    const modalTitle = document.getElementById('customConfirmModalLabel');
    const modalBody = document.getElementById('customConfirmModalBody');
    const confirmButton = document.getElementById('customConfirmButton');

    // Set modal content
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    // Clear previous event listener to prevent multiple triggers
    confirmButton.onclick = null; 
    confirmButton.onclick = () => {
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
        customConfirmModalInstance.hide();
    };
    customConfirmModalInstance.show();
}


/**
 * Shows or hides the loading overlay for the users table.
 * @param {boolean} show True to show loading overlay, false to hide.
 */
function showUsersLoadingOverlay(show) {
    const overlay = document.getElementById('usersLoadingOverlay');
    const tableBody = document.getElementById('usersTableBody');
    const noUsersMessage = document.getElementById('noUsersMessage');
    if (overlay && tableBody && noUsersMessage) {
        if (show) {
            overlay.classList.remove('d-none');
            tableBody.classList.add('d-none'); // Hide table body while loading
            noUsersMessage.classList.add('d-none'); // Hide no data message while loading
        } else {
            overlay.classList.add('d-none');
            // The visibility of tableBody and noUsersMessage is managed by populateUserTable
            // This function's responsibility is primarily the overlay.
            // populateUserTable will handle showing/hiding tableBody/noUsersMessage based on data.
        }
    } else {
        console.warn("User loading overlay, table body, or no data message element not found.");
    }
}

// Listen for the tokenAvailable event dispatched by auth.js
// This ensures that fetchUsers is called only after the token is ready
window.addEventListener('tokenAvailable', async (event) => {
    currentUserToken = event.detail.token;
    // Get the current authenticated user from auth.js
    const user = auth.currentUser; 
    if (user) {
        currentUserUid = user.uid;
        await fetchUsers(); // Call fetchUsers now that token and UID are available
        logActivity("PAGE_VIEW", "Viewed User Management page."); // Log page view
    } else {
        // If no user, redirect to login page
        window.location.href = "/";
    }
});


async function fetchUsers() {
    showUsersLoadingOverlay(true); // Show loading overlay when fetch starts
    const usersTableBody = document.getElementById('usersTableBody');
    const noUsersMessage = document.getElementById('noUsersMessage');
    
    // Clear previous data
    usersTableBody.innerHTML = '';
    noUsersMessage.classList.add('d-none'); 

    // Ensure token is available before making the request
    if (!currentUserToken) {
        console.error("Authentication token not available. Cannot fetch users.");
        showCustomAlert("Authentication token not available. Please ensure you are logged in.", "Authentication Required");
        usersTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Authentication required to view users.</td></tr>'; // Increased colspan
        showUsersLoadingOverlay(false);
        // Ensure tbody is shown if an error occurs and it was hidden by the loading overlay
        usersTableBody.classList.remove('d-none'); 
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${currentUserToken}` } 
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
            logActivity("USER_LIST_FETCH_FAILED", `Failed to fetch user list: ${errorMessage}`);
            showCustomAlert("Error loading users: " + errorMessage, "Error");
            // Display error in table
            usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error loading users. ${errorMessage}</td></tr>`; // Increased colspan
            noUsersMessage.classList.add('d-none'); // Hide no data message if error is shown
            // Ensure tbody is shown if an error occurs and it was hidden by the loading overlay
            usersTableBody.classList.remove('d-none'); 
            return; // Exit after displaying error
        }

        const users = await response.json();
        console.log("Fetched users data:", users); // DEBUG LOG
        populateUserTable(users);
        logActivity("USER_LIST_FETCH_SUCCESS", "Successfully fetched user list.");
    } catch (error) {
        console.error("Error loading users:", error.message);
        // Error already logged above if it's an API error, otherwise a general client error
        showCustomAlert("An unexpected error occurred while loading users. Please check console for details.", "Error");
        usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">An unexpected error occurred.</td></tr>`; // Increased colspan
        noUsersMessage.classList.add('d-none'); // Hide no data message if error is shown
        // Ensure tbody is shown if an error occurs and it was hidden by the loading overlay
        usersTableBody.classList.remove('d-none'); 
    } finally {
        showUsersLoadingOverlay(false); // Hide loading overlay after fetch completes
    }
}

// Helper to get roles from custom_claims object
function getRolesFromClaims(custom_claims) {
    const roles = [];
    if (custom_claims) {
        // Ensure consistent key names with your Firebase custom claims backend
        // Use strict '=== true' for boolean checks
        if (custom_claims.admin === true) roles.push("Admin");
        // Using bracket notation for keys with spaces, and strict boolean check
        if (custom_claims['Marketing Team'] === true) roles.push("Marketing Team"); 
        if (custom_claims['Social Media Manager'] === true) roles.push("Social Media Manager");
    }
    return roles;
}

function populateUserTable(users) {
    const tbody = document.getElementById("usersTableBody"); // Get tbody by ID
    const noUsersMessage = document.getElementById('noUsersMessage');
    tbody.innerHTML = ""; // Clear existing rows

    if (users.length === 0) {
        noUsersMessage.classList.remove('d-none'); // Show "No users found" message
        // Ensure tbody is visible even if it's empty, so the "No users found" message appears
        tbody.classList.remove('d-none'); 
        console.log("No users found. Displaying no data message."); // DEBUG LOG
        return;
    } else {
        noUsersMessage.classList.add('d-none'); // Hide "No users found" message
        // Ensure tbody is visible when users are present
        tbody.classList.remove('d-none'); 
        console.log("Populating table with", users.length, "users."); // DEBUG LOG
    }

    const currentUserData = users.find(u => u.uid === currentUserUid);
    const currentUserRoles = getRolesFromClaims(currentUserData?.custom_claims);
    const isAdmin = currentUserRoles.includes("Admin");

    users.forEach(user => {
        console.log("Processing user:", user.email, "UID:", user.uid); // DEBUG LOG
        const tr = document.createElement("tr");
        tr.dataset.uid = user.uid;

        const userRoles = getRolesFromClaims(user.custom_claims);
        console.log("User roles for", user.email, ":", userRoles); // DEBUG LOG

        tr.innerHTML = `
            <td>${user.email}</td>
            <td class="user-id-column">${user.uid}</td> <!-- User ID column is always visible -->
            <td>
                <input type="text" class="form-control form-control-sm display-name-input" 
                       id="displayName_${user.uid}" name="displayName_${user.uid}" 
                       value="${user.display_name || ''}" 
                       aria-label="Display Name for ${user.email}" />
            </td>
            <td>
                <div class="role-checkbox-group">
                    <div class="form-check form-check-inline">
                        <input class="form-check-input role-checkbox" type="checkbox" 
                               data-role="admin" id="admin_${user.uid}" value="Admin" 
                               ${userRoles.includes("Admin") ? "checked" : ""}>
                        <label class="form-check-label" for="admin_${user.uid}">Admin</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input role-checkbox" type="checkbox" 
                               data-role="marketingTeam" id="marketingTeam_${user.uid}" value="Marketing Team" 
                               ${userRoles.includes("Marketing Team") ? "checked" : ""}>
                        <label class="form-check-label" for="marketingTeam_${user.uid}">Marketing Team</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="checkbox" 
                               data-role="socialMediaManager" id="socialMediaManager_${user.uid}" value="Social Media Manager" 
                               ${userRoles.includes("Social Media Manager") ? "checked" : ""}>
                        <label class="form-check-label" for="socialMediaManager_${user.uid}">Social Media Manager</label>
                    </div>
                </div>
            </td>
            <td>
                <button class="btn dashboard-btn-gradient btn-sm me-2 save-btn">Save</button>
                <button class="btn btn-danger btn-sm delete-btn">Delete</button>
            </td>
        `;

        const deleteBtn = tr.querySelector(".delete-btn");
        const saveBtn = tr.querySelector(".save-btn");
        const displayNameInput = tr.querySelector(".display-name-input");
        const roleCheckboxes = tr.querySelectorAll(".role-checkbox");

        // Disable deletion of own account
        if (user.uid === currentUserUid) {
            deleteBtn.disabled = true;
            deleteBtn.title = "You cannot delete your own account.";
        }
        
        // Admin cannot edit or delete other admins (unless they are the same user)
        // Also prevent non-admins from editing anyone's roles/info
        if (!isAdmin || (userRoles.includes("Admin") && user.uid !== currentUserUid)) {
            // Disable inputs for admin users by non-admin or if trying to edit another admin as admin
            displayNameInput.disabled = true;
            roleCheckboxes.forEach(cb => cb.disabled = true);
            saveBtn.disabled = true; // Disable save button if inputs are disabled
        }
        
        // If current user is Admin and the user being iterated is another Admin
        if (isAdmin && userRoles.includes("Admin") && user.uid !== currentUserUid) {
            deleteBtn.disabled = true; // Admin cannot delete another admin
            deleteBtn.title = "Admins cannot delete other Admins.";
            saveBtn.title = "Admins cannot edit other Admins.";
        }


        tbody.appendChild(tr);
        console.log("Appended row for user:", user.email); // DEBUG LOG
    });

    console.log("Table tbody innerHTML after population:", tbody.innerHTML); // DEBUG LOG
    attachTableEventListeners(); // Attach event listeners for save/delete buttons
}


function attachTableEventListeners() {
    document.querySelectorAll("#usersTableBody .save-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const tr = e.target.closest("tr");
            await saveUserChanges(tr);
        };
    });

    document.querySelectorAll("#usersTableBody .delete-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const tr = e.target.closest("tr");
            const userEmail = tr.querySelector("td:first-child").textContent; // Get email for logging
            showCustomConfirm(`Are you sure you want to delete user ${userEmail}? This action cannot be undone.`, "Confirm Deletion", async () => {
                await deleteUser(tr.dataset.uid, userEmail); // Pass email for logging
            });
        };
    });
}

async function saveUserChanges(tr) {
    const uid = tr.dataset.uid;
    const email = tr.querySelector("td:first-child").textContent;
    const displayName = tr.querySelector(".display-name-input").value.trim();

    // Get selected roles from checkboxes
    const roles = {
        admin: false,
        'Marketing Team': false, // Ensure key matches backend claim key exactly
        'Social Media Manager': false // Ensure key matches backend claim key exactly
    };

    tr.querySelectorAll('.role-checkbox:checked').forEach(checkbox => {
        // The value attribute of the checkbox directly corresponds to the claim key name
        // e.g., value="Admin", value="Marketing Team", value="Social Media Manager"
        const roleValue = checkbox.value; 
        if (roleValue === "Admin") {
            roles.admin = true;
        } else if (roleValue === "Marketing Team") {
            roles['Marketing Team'] = true;
        } else if (roleValue === "Social Media Manager") {
            roles['Social Media Manager'] = true;
        }
    });

    // Handle case where all roles are unchecked (clear all claims)
    const hasAnyRole = Object.values(roles).some(value => value === true);
    let rolesToSend = hasAnyRole ? roles : {}; // Send empty object to clear claims

    try {
        const response = await fetch(`${API_BASE_URL}/users/${uid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentUserToken}` 
            },
            body: JSON.stringify({
                display_name: displayName,
                roles: rolesToSend // Send the collected roles object
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
            logActivity("ADMIN_USER_UPDATE_FAILED", `Admin failed to update user '${email}' (UID: '${uid}'). Error: ${errorMessage}`);
            showCustomAlert("Error updating user: " + errorMessage, "Error");
            throw new Error(errorMessage);
        }
        showCustomAlert("User updated successfully.", "Success");
        logActivity("ADMIN_USER_UPDATED", `Admin updated user '${email}' (UID: '${uid}'). Roles: ${JSON.stringify(rolesToSend)}`);
        // Refresh the user list to reflect changes in UI and re-evaluate permissions
        await fetchUsers(); 
    } catch (error) {
        console.error("Error updating user:", error.message);
    }
}

async function deleteUser(uid, email) { // Added email parameter
    if (!currentUserToken) {
        showCustomAlert("Authentication token not available. Cannot delete user.", "Authentication Required");
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/users/${uid}`, {
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
            logActivity("ADMIN_USER_DELETE_FAILED", `Admin failed to delete user '${email}' (UID: '${uid}'). Error: ${errorMessage}`);
            showCustomAlert("Error deleting user: " + errorMessage, "Error");
            throw new Error(errorMessage);
        }
        showCustomAlert("User deleted successfully.", "Success");
        logActivity("ADMIN_USER_DELETED", `Admin deleted user '${email}' (UID: '${uid}').`);
        await fetchUsers(); // Refresh list after deletion
    } catch (error) {
        console.error("Error deleting user:", error.message);
    }
}

// Initialize modals and attach static event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Bootstrap modal instances
    const createUserModalElement = document.getElementById('createUserModal');
    if (createUserModalElement) {
        createUserModalInstance = new bootstrap.Modal(createUserModalElement);
    } else {
        console.error("Create User Modal element not found!");
    }

    const editUserModalElement = document.getElementById('editUserModal');
    if (editUserModalElement) {
        editUserModalInstance = new bootstrap.Modal(editUserModalElement);
    } else {
        console.error("Edit User Modal element not found!");
    }

    // Event listener for Create User Form submission
    document.getElementById('createUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('createEmail').value.trim();
        const password = document.getElementById('createPassword').value;
        const displayName = document.getElementById('createDisplayName').value.trim();

        // Get roles from checkboxes in create modal
        const roles = {
            admin: document.getElementById('createRoleAdmin').checked,
            'Marketing Team': document.getElementById('createRoleMarketing').checked,
            'Social Media Manager': document.getElementById('createRoleSocialMedia').checked
        };

        if (!email || !password || (!roles.admin && !roles['Marketing Team'] && !roles['Social Media Manager'])) {
            showCustomAlert("Please fill all required fields and select at least one role.", "Input Required");
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/users`, {
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
                logActivity("ADMIN_USER_CREATE_FAILED", `Admin failed to create user '${email}'. Error: ${errorMessage}`);
                showCustomAlert("Error creating user: " + errorMessage, "Error");
                throw new Error(errorMessage);
            }

            showCustomAlert("User created successfully.", "Success");
            logActivity("ADMIN_USER_CREATED", `Admin created user: '${email}' (UID: ${result.uid}). Roles: ${JSON.stringify(roles)}`);
            createUserModalInstance.hide(); // Hide the create user modal
            document.getElementById('createUserForm').reset(); // Clear the form
            await fetchUsers(); // Refresh the user list
        } catch (error) {
            console.error("Error creating user:", error.message);
        }
    });

    // Event listener for Edit User Form submission
    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const uid = document.getElementById('editUid').value;
        const email = document.getElementById('editEmail').value; // For logging
        const displayName = document.getElementById('editDisplayName').value.trim();

        const roles = {
            admin: document.getElementById('editRoleAdmin').checked,
            'Marketing Team': document.getElementById('editRoleMarketing').checked,
            'Social Media Manager': document.getElementById('editRoleSocialMedia').checked
        };
        
        // If all roles are unchecked, send an empty object to clear claims
        const hasAnyRoleSelected = Object.values(roles).some(value => value === true);
        const rolesToSend = hasAnyRoleSelected ? roles : {};

        try {
            const response = await fetch(`${API_BASE_URL}/users/${uid}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${currentUserToken}`
                },
                body: JSON.stringify({
                    display_name: displayName,
                    roles: rolesToSend
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
                logActivity("ADMIN_USER_UPDATE_FAILED", `Admin failed to update user '${email}' (UID: '${uid}'). Error: ${errorMessage}`);
                showCustomAlert("Error updating user: " + errorMessage, "Error");
                throw new Error(errorMessage);
            }
            showCustomAlert("User updated successfully.", "Success");
            logActivity("ADMIN_USER_UPDATED", `Admin updated user '${email}' (UID: '${uid}'). Roles: ${JSON.stringify(rolesToSend)}`);
            editUserModalInstance.hide(); // Hide the edit user modal
            await fetchUsers(); // Refresh the user list
        } catch (error) {
            console.error("Error updating user:", error.message);
        }
    });
});

// Expose openCreateUserModal and openEditUserModal globally for onclick attributes
window.openCreateUserModal = function() {
    if (createUserModalInstance) {
        document.getElementById('createUserForm').reset();
        // Set default roles for new user if needed, e.g., uncheck all initially or set a default
        document.getElementById('createRoleAdmin').checked = false;
        document.getElementById('createRoleMarketing').checked = false;
        document.getElementById('createRoleSocialMedia').checked = false;
        createUserModalInstance.show();
    } else {
        console.error("Create User Modal not initialized.");
    }
};

window.openEditUserModal = function(user) {
    if (editUserModalInstance) {
        document.getElementById('editUid').value = user.uid;
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editDisplayName').value = user.display_name || '';

        // Safely check and set checkbox states based on custom_claims
        const userClaims = user.custom_claims || {};
        document.getElementById('editRoleAdmin').checked = userClaims.admin === true;
        document.getElementById('editRoleMarketing').checked = userClaims['Marketing Team'] === true;
        document.getElementById('editRoleSocialMedia').checked = userClaims['Social Media Manager'] === true;

        editUserModalInstance.show();
    } else {
        console.error("Edit User Modal not initialized.");
    }
};
