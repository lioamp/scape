// Make sure Chart.js is loaded in your HTML before this script runs.

// Sample data (replace these with your actual uploaded data later)
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const reachData = [12000, 15000, 14000, 18000, 20000, 22000];
const engagementData = [500, 700, 650, 800, 900, 1000];
const salesData = [50, 60, 55, 70, 80, 90];

// Reach Chart - Bar
const reachCtx = document.getElementById('reachChart').getContext('2d');
const reachChart = new Chart(reachCtx, {
  type: 'bar',
  data: {
    labels: months,
    datasets: [{
      label: 'Reach',
      data: reachData,
      backgroundColor: 'rgba(54, 162, 235, 0.6)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1
    }]
  },
  options: {
    responsive: true,
    scales: {
      y: { beginAtZero: true }
    }
  }
});

// Engagement Chart - Line
const engagementCtx = document.getElementById('engagementChart').getContext('2d');
const engagementChart = new Chart(engagementCtx, {
  type: 'line',
  data: {
    labels: months,
    datasets: [{
      label: 'Engagement',
      data: engagementData,
      fill: false,
      borderColor: 'rgba(255, 99, 132, 1)',
      backgroundColor: 'rgba(255, 99, 132, 0.2)',
      tension: 0.3
    }]
  },
  options: {
    responsive: true,
    scales: {
      y: { beginAtZero: true }
    }
  }
});

// Monthly Sales Chart - Bar
const salesCtx = document.getElementById('salesChart').getContext('2d');
const salesChart = new Chart(salesCtx, {
  type: 'bar',
  data: {
    labels: months,
    datasets: [{
      label: 'Sales',
      data: salesData,
      backgroundColor: 'rgba(75, 192, 192, 0.6)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1
    }]
  },
  options: {
    responsive: true,
    scales: {
      y: { beginAtZero: true }
    }
  }
});
