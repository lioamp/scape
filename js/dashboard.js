document.addEventListener("DOMContentLoaded", () => {
  const dashboardLink = document.getElementById("dashboard-link");
  if (window.location.pathname.endsWith("dashboard.html")) {
    dashboardLink.classList.add("active");
  }
});
