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

    const response = await fetch("/api/upload-data", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      uploadStatus.textContent = "Upload successful!";
      setTimeout(() => {
        uploadStatus.style.display = "none";
        const uploadModal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
        uploadModal.hide();
        uploadForm.reset();
      }, 1500);
    } else {
      uploadStatus.textContent = "Upload failed: " + result.message;
    }
  } catch (err) {
    uploadStatus.textContent = "Upload error: " + err.message;
  }
});

initUploadButton();
