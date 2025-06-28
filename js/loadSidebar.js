document.addEventListener("DOMContentLoaded", async () => {
  const sidebarContainer = document.getElementById("sidebar-container");
  if (sidebarContainer) {
    try {
      // Changed to an absolute path for fetching sidebar.html
      const response = await fetch("/components/sidebar.html");
      const html = await response.text();
      sidebarContainer.innerHTML = html;

      // Optional: Highlight current link
      const currentPageSegment = window.location.pathname.split("/").filter(Boolean).pop(); // Get the last segment (e.g., 'dashboard', 'performance-evaluation')

      // Find the link in the sidebar that matches the current page's folder name
      // This will match hrefs like "/dashboard/", "/performance-evaluation/", etc.
      let activeLink = null;
      if (currentPageSegment) {
          activeLink = document.querySelector(`a[href^="/${currentPageSegment}/"]`);
      } else if (window.location.pathname === "/") {
          // If at the root path "/", assume dashboard is the default active link after login
          activeLink = document.getElementById("dashboard-link");
      }
      
      if (activeLink) {
          activeLink.classList.add("active");
      }

      // Dispatch a custom event after the sidebar content is loaded
      document.dispatchEvent(new Event('sidebarLoaded'));

    } catch (error) {
      console.error("Failed to load sidebar:", error);
    }
  }
});
