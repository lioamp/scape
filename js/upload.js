import { logActivity } from "/js/auth.js"; // Import the logActivity function
import { getCurrentUserRole } from './auth.js'; 

const uploadSection = document.getElementById("upload-section");
const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");

async function initUploadButton() {
  const role = await getCurrentUserRole(); 

  if (role === "Admin" || role === "Marketing Team") { // Changed "Uploader" to "Marketing Team" based on previous context
    uploadSection.classList.remove("d-none");
  } else {
    uploadSection.classList.add("d-none");
  }
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const app = document.getElementById("appSelect").value;
  const fileInput = document.getElementById("dataFile");
  const file = fileInput.files[0];

  if (!app) {
    showCustomAlert("Please select an app.", "Selection Required"); // Use custom alert
    return;
  }
  if (!file) {
    showCustomAlert("Please select a file.", "File Required"); // Use custom alert
    return;
  }

  uploadStatus.style.display = "block";
  uploadStatus.textContent = "Uploading...";

  try {
    const formData = new FormData();
    formData.append("app", app);
    formData.append("file", file);

    // Get current user token from window.currentUserToken for authorization
    const token = window.currentUserToken; 
    if (!token) {
        showCustomAlert("Authentication token not available. Please log in.", "Authentication Required");
        uploadStatus.style.display = "none";
        return;
    }

    const response = await fetch("http://127.0.0.1:5000/api/upload-data", {
      method: "POST",
      headers: {
          'Authorization': `Bearer ${token}` // Add Authorization header
      },
      body: formData,
    });

    let result = {};
    if (response.status !== 204 && response.headers.get('content-type')?.includes('application/json')) {
      result = await response.json();
    } else if (response.status === 204) {
      result = { message: "Upload successful (no content returned from server)." };
    } else {
      result = { message: response.statusText || "Unknown error occurred." };
    }


    if (response.ok) {
      uploadStatus.textContent = "Upload successful! " + (result.message || "");
      logActivity("DATA_UPLOAD_SUCCESS", `Uploaded data for app '${app}' from file '${file.name}'.`); // Log success
      setTimeout(() => {
        uploadStatus.style.display = "none";
        const uploadModal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
        uploadModal.hide();
        uploadForm.reset();
        // Re-render charts to show the newly uploaded data
        const currentPlatformDropdown = document.getElementById('platformFilterDropdown');
        const currentPlatform = currentPlatformDropdown ? currentPlatformDropdown.dataset.platform : 'all';
        const currentTimeRangeDropdown = document.getElementById('timeRangeFilterDropdown');
        const currentTimeRange = currentTimeRangeDropdown ? currentTimeRangeDropdown.dataset.timeRange : 'lastYear';
        if (typeof renderAllCharts === 'function') { // Changed to renderAllCharts
            renderAllCharts(currentPlatform, currentTimeRange);
        } else {
            console.warn("renderAllCharts function not found. Charts may not auto-update.");
        }
      }, 1500);
    } else {
      uploadStatus.textContent = "Upload failed: " + (result.message || `Status: ${response.status}`);
      logActivity("DATA_UPLOAD_FAILED", `Failed to upload data for app '${app}' from file '${file.name}'. Error: ${result.message || response.statusText}`); // Log failure
    }
  } catch (err) {
    uploadStatus.textContent = "Upload error: " + err.message;
    logActivity("DATA_UPLOAD_ERROR", `Error during data upload for app '${app}' from file '${file?.name}'. Error: ${err.message}`); // Log error
  }
});

// Helper function for custom alerts (needed here since it's not imported from a general utils)
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

// Initial call to set up the upload button visibility
initUploadButton();
