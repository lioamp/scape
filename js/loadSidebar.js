document.addEventListener("DOMContentLoaded", async () => {
  const sidebarContainer = document.getElementById("sidebar-container");
  if (sidebarContainer) {
    try {
      const response = await fetch("components/sidebar.html");
      const html = await response.text();
      sidebarContainer.innerHTML = html;

      // Optional: Highlight current link
      const currentPage = window.location.pathname.split("/").pop();
      const activeLink = document.querySelector(`a[href="${currentPage}"]`);
      if (activeLink) activeLink.classList.add("active");

      // Dispatch a custom event after the sidebar content is loaded
      document.dispatchEvent(new Event('sidebarLoaded'));

    } catch (error) {
      console.error("Failed to load sidebar:", error);
    }
  }
});
