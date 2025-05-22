// Utility to convert date string (YYYY-MM-DD) to month abbreviation
function getMonthAbbreviation(dateStr) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = new Date(dateStr);
  return months[date.getMonth()];
}

async function fetchTikTokData() {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/tiktokdata'); // Full URL with port 5000
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log("TikTok API data:", data);

    // Normalize keys just in case the API uses uppercase
    const labels = data.map(row => getMonthAbbreviation(row.date || row.Date));
    const reachData = data.map(row => row.reach ?? row.Reach ?? 0);
    const engagementData = data.map(row => row.engagement ?? row.Engagement ?? 0);
    const salesData = data.map(row => row.sales ?? row.Sales ?? 0);

    return { labels, reachData, engagementData, salesData };
  } catch (error) {
    console.error('Error fetching TikTok data:', error);
    alert('Failed to load TikTok data.');
    return null;
  }
}


async function renderCharts() {
  const tikTokData = await fetchTikTokData();
  if (!tikTokData) return;

  const { labels, reachData, engagementData, salesData } = tikTokData;

  // Reach Chart
  const reachCtx = document.getElementById('reachChart').getContext('2d');
  new Chart(reachCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Reach',
        data: reachData,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });

  // Engagement Chart
  const engagementCtx = document.getElementById('engagementChart').getContext('2d');
  new Chart(engagementCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Engagement',
        data: engagementData,
        fill: false,
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        tension: 0.3
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });

  // Sales Chart
  const salesCtx = document.getElementById('salesChart').getContext('2d');
  new Chart(salesCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Sales',
        data: salesData,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

// Run after DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  renderCharts();
});
