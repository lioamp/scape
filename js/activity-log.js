import { logActivity } from "/js/auth.js"; // Import the logActivity function
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Define the base URL for your Flask API backend
const API_BASE_URL = "http://127.0.0.1:5000/api";

const auth = getAuth(); // Get the auth instance

const PAGE_SIZE = 10; // Number of logs per page
let currentPage = 1;
let totalPages = 1;
let currentFilters = {
    startDate: '',
    endDate: '',
    userId: ''
};

// Helper function to show a custom alert modal
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');
    const modalTitle = document.getElementById('customAlertModalLabel');
    const modalBody = document.getElementById('customAlertModalBody');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

/**
 * Shows or hides the loading overlay for the activity log table.
 * @param {boolean} show True to show loading overlay, false to hide.
 */
function showLogLoadingOverlay(show) {
    const overlay = document.getElementById('logLoadingOverlay');
    const tableBody = document.getElementById('activityLogTableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    if (overlay && tableBody && noDataMessage) {
        if (show) {
            overlay.classList.remove('d-none');
            tableBody.style.display = 'none'; // Hide table body while loading
            noDataMessage.classList.add('d-none'); // Hide no data message
        } else {
            overlay.classList.add('d-none');
            // Visibility of tableBody and noDataMessage will be handled by populateActivityLogTable
        }
    }
}

/**
 * Fetches activity logs from the backend.
 * @param {number} page - The page number to fetch.
 * @param {object} filters - Object containing startDate, endDate, and userId filters.
 * @returns {Promise<object|null>} Data containing logs, totalCount, and currentPage.
 */
async function fetchActivityLogs(page, filters) {
    showLogLoadingOverlay(true);
    try {
        const user = auth.currentUser;
        if (!user) {
            showCustomAlert("User not authenticated. Please log in to view activity logs.", "Authentication Required");
            showLogLoadingOverlay(false);
            return null;
        }

        // Ensure we await the ID token to guarantee it's fetched before the request
        const idToken = await user.getIdToken(true); // true forces a refresh, ensuring latest token/claims
        
        if (!idToken) {
            console.error("Firebase ID token is null or undefined after getIdToken(). Cannot fetch activity logs.");
            showCustomAlert("Authentication token not available. Please try logging in again.", "Authentication Error");
            showLogLoadingOverlay(false);
            return null;
        }

        const queryParams = new URLSearchParams({
            page: page,
            limit: PAGE_SIZE,
            start_date: filters.startDate || '',
            end_date: filters.endDate || '',
            user_id: filters.userId || ''
        }).toString();

        const requestUrl = `${API_BASE_URL}/activity_logs?${queryParams}`;
        console.log("Fetching activity logs from URL:", requestUrl); // Log the full request URL
        console.log("Authorization Header being sent:", `Bearer ${idToken.substring(0, 20)}...`); // Log part of the token for verification

        const response = await fetch(requestUrl, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`API response error (${response.status}):`, errorData); // Log full error response
            throw new Error(errorData.error || response.statusText);
        }

        const data = await response.json();
        console.log("Activity logs data received:", data); // Log the received data
        return data;

    } catch (error) {
        console.error('Error fetching activity logs:', error);
        showCustomAlert(`Error loading activity logs: ${error.message}`, "Data Load Error");
        logActivity("ACTIVITY_LOG_FETCH_FAILED", `Failed to fetch activity logs: ${error.message}`);
        return null;
    } finally {
        showLogLoadingOverlay(false);
    }
}

/**
 * Populates the activity log table with fetched data.
 * @param {Array<object>} logs - Array of log objects.
 */
function populateActivityLogTable(logs) {
    const tbody = document.getElementById('activityLogTableBody');
    const noDataMessage = document.getElementById('noDataMessage');
    tbody.innerHTML = ''; // Clear existing rows

    if (logs && logs.length > 0) {
        noDataMessage.classList.add('d-none');
        tbody.style.display = ''; // Show table body
        logs.forEach(log => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = new Date(log.timestamp).toLocaleString();
            row.insertCell(1).textContent = log.user_id;
            row.insertCell(2).textContent = log.action;
            row.insertCell(3).textContent = log.details || '-'; // Display '-' if no details
        });
    } else {
        noDataMessage.classList.remove('d-none');
        tbody.style.display = 'none'; // Hide table body
    }
}

/**
 * Updates pagination controls and fetches logs for the current page.
 */
async function updateActivityLogView() {
    const data = await fetchActivityLogs(currentPage, currentFilters);
    if (data) {
        populateActivityLogTable(data.logs);
        totalPages = Math.ceil(data.total_count / PAGE_SIZE);
        document.getElementById('currentPageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = currentPage === 1;
        document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
    } else {
        populateActivityLogTable([]); // Clear table on error or no data
        document.getElementById('currentPageInfo').textContent = `Page 0 of 0`;
        document.getElementById('prevPageBtn').disabled = true;
        document.getElementById('nextPageBtn').disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const activityFilterForm = document.getElementById('activityFilterForm');
    const filterStartDateInput = document.getElementById('filterStartDate');
    const filterEndDateInput = document.getElementById('filterEndDate');
    const filterUserIdInput = document.getElementById('filterUserId');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    // Set default dates for the filter: very wide range for initial testing
    const today = new Date();
    // Default to the beginning of 2020 for a very wide range
    filterStartDateInput.value = '2020-01-01'; 
    filterEndDateInput.value = today.toISOString().split('T')[0];
    
    // Initial fetch of logs (will happen after token available)
    currentFilters = {
        startDate: filterStartDateInput.value,
        endDate: filterEndDateInput.value,
        userId: filterUserIdInput.value
    };

    // Listen for Firebase token availability
    window.addEventListener('tokenAvailable', () => {
        logActivity("PAGE_VIEW", "Viewed Activity Log page.");
        console.log("Token available. Initializing activity log fetch.");
        updateActivityLogView();
    }, { once: true });

    // Check if the token is already available on direct page load
    if (window.currentUserToken) {
        logActivity("PAGE_VIEW", "Viewed Activity Log page.");
        console.log("Authentication token already found. Initializing activity log fetch immediately.");
        updateActivityLogView();
    } else {
        console.log("Waiting for authentication token for activity log page...");
    }


    activityFilterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        currentPage = 1; // Reset to first page on new filter
        currentFilters = {
            startDate: filterStartDateInput.value,
            endDate: filterEndDateInput.value,
            userId: filterUserIdInput.value.trim()
        };
        await updateActivityLogView();
        logActivity("ACTIVITY_LOG_FILTER_APPLIED", `Applied filters: Start: ${currentFilters.startDate}, End: ${currentFilters.endDate}, User: ${currentFilters.userId}`);
    });

    prevPageBtn.addEventListener('click', async () => {
        if (currentPage > 1) {
            currentPage--;
            await updateActivityLogView();
            logActivity("ACTIVITY_LOG_PAGINATION", `Navigated to page ${currentPage}.`);
        }
    });

    nextPageBtn.addEventListener('click', async () => {
        if (currentPage < totalPages) {
            currentPage++;
            await updateActivityLogView();
            logActivity("ACTIVITY_LOG_PAGINATION", `Navigated to page ${currentPage}.`);
        }
    });
});
