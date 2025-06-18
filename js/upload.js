import { getCurrentUserRole } from './auth.js'; // Assume you have this function or adjust accordingly

const uploadSection = document.getElementById("upload-section");
const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");

async function initUploadButton() {
  // Replace this with your actual role fetching logic, e.g. from Firebase auth or your backend
  const role = await getCurrentUserRole(); // returns "Admin", "Marketing Team", or others

  if (role === "Admin" || role === "Uploader") {
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
    alert("Please select an app.");
    return;
  }
  if (!file) {
    alert("Please select a file.");
    return;
  }

  uploadStatus.style.display = "block";
  uploadStatus.textContent = "Uploading...";

  try {
    const formData = new FormData();
    formData.append("app", app);
    formData.append("file", file);

    const response = await fetch("http://127.0.0.1:5000/api/upload-data", {
      method: "POST",
      body: formData,
    });

    // Check if the response status is 204 (No Content) or if there's no content type header
    // Only attempt to parse JSON if there's actual content
    let result = {};
    if (response.status !== 204 && response.headers.get('content-type')?.includes('application/json')) {
      result = await response.json();
    } else if (response.status === 204) {
      // If it's 204, it's a successful response with no content
      result = { message: "Upload successful (no content returned from server)." };
    } else {
      // For other cases where content-type is not JSON or it's empty
      result = { message: response.statusText || "Unknown error occurred." };
    }


    if (response.ok) {
      uploadStatus.textContent = "Upload successful! " + (result.message || "");
      setTimeout(() => {
        uploadStatus.style.display = "none";
        const uploadModal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
        uploadModal.hide();
        uploadForm.reset();
        // Re-render charts to show the newly uploaded data
        // Get current platform and time range from dropdowns
        const currentPlatformDropdown = document.getElementById('platformFilterDropdown');
        const currentPlatform = currentPlatformDropdown ? currentPlatformDropdown.dataset.platform : 'all';
        const currentTimeRangeDropdown = document.getElementById('timeRangeFilterDropdown');
        const currentTimeRange = currentTimeRangeDropdown ? currentTimeRangeDropdown.dataset.timeRange : 'lastYear';
        if (typeof renderCharts === 'function') { // Ensure renderCharts is available
            renderCharts(currentPlatform, currentTimeRange);
        } else {
            console.warn("renderCharts function not found. Charts may not auto-update.");
        }
      }, 1500);
    } else {
      // Use the message from the server if available, otherwise a generic error
      uploadStatus.textContent = "Upload failed: " + (result.message || `Status: ${response.status}`);
    }
  } catch (err) {
    uploadStatus.textContent = "Upload error: " + err.message;
  }
});

initUploadButton();
