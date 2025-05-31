// Utility to convert date string (YYYY-MM-DD) to month abbreviation
function getMonthAbbreviation(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(dateStr);
    return months[date.getMonth()];
}

/**
 * Merges two arrays of data, summing common date entries and including unique ones.
 * Assumes data objects have a 'date' property and numerical 'reach', 'engagement', 'sales' properties.
 * @param {Array<Object>} data1 - First array of data.
 * @param {Array<Object>} data2 - Second array of data.
 * @returns {Array<Object>} Merged and sorted data.
 */
function mergeData(data1, data2) {
    const mergedMap = new Map();

    // Process data1
    data1.forEach(item => {
        const date = item.date || item.Date;
        if (date) {
            mergedMap.set(date, {
                date: date,
                reach: (item.reach ?? item.Reach ?? 0),
                engagement: (item.engagement ?? item.Engagement ?? 0),
                sales: (item.sales ?? item.Sales ?? 0)
            });
        }
    });

    // Process data2, merging with existing or adding new
    data2.forEach(item => {
        const date = item.date || item.Date;
        if (date) {
            if (mergedMap.has(date)) {
                const existing = mergedMap.get(date);
                mergedMap.set(date, {
                    date: date,
                    reach: existing.reach + (item.reach ?? item.Reach ?? 0),
                    engagement: existing.engagement + (item.engagement ?? item.Engagement ?? 0),
                    sales: existing.sales + (item.sales ?? item.Sales ?? 0)
                });
            } else {
                mergedMap.set(date, {
                    date: date,
                    reach: (item.reach ?? item.Reach ?? 0),
                    engagement: (item.engagement ?? item.Engagement ?? 0),
                    sales: (item.sales ?? item.Sales ?? 0)
                });
            }
        }
    });

    // Convert map back to array and sort by date
    const mergedArray = Array.from(mergedMap.values());
    mergedArray.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log("Merged Data:", mergedArray); // Added console log for merged data
    return mergedArray;
}

/**
 * Fetches platform-specific data (TikTok, Facebook, or both) from the backend API.
 * @param {string} platform - The platform to fetch data for ('tiktok', 'facebook', or 'all').
 * @returns {Promise<Object|null>} An object containing labels, reachData, engagementData, salesData, and rawData, or null if an error occurs.
 */
async function fetchPlatformData(platform) {
    let rawData = [];
    try {
        if (platform === 'all') {
            console.log("Fetching data for All Platforms...");
            const [tiktokResponse, facebookResponse] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/tiktokdata'),
                fetch('http://127.0.0.1:5000/api/facebookdata')
            ]);

            const tiktokData = tiktokResponse.ok ? await tiktokResponse.json() : [];
            const facebookData = facebookResponse.ok ? await facebookResponse.json() : [];

            console.log("Raw TikTok Data:", tiktokData); // Added console log
            console.log("Raw Facebook Data:", facebookData); // Added console log

            rawData = mergeData(tiktokData, facebookData);

        } else if (platform === 'tiktok') {
            console.log("Fetching data for TikTok...");
            const response = await fetch('http://127.0.0.1:5000/api/tiktokdata');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            rawData = await response.json();

        } else if (platform === 'facebook') {
            console.log("Fetching data for Facebook...");
            const response = await fetch('http://127.0.0.1:5000/api/facebookdata');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            rawData = await response.json();
        } else {
            console.warn("Invalid platform selected:", platform);
            return null;
        }

        console.log(`Processed ${platform} API data:`, rawData); // Renamed log for clarity

        // Map raw data to chart-friendly formats, handling potential case variations in keys
        const labels = rawData.map(row => getMonthAbbreviation(row.date || row.Date));
        const reachData = rawData.map(row => row.reach ?? row.Reach ?? 0);
        const engagementData = rawData.map(row => row.engagement ?? row.Engagement ?? 0);
        const salesData = rawData.map(row => row.sales ?? row.Sales ?? 0);

        return { labels, reachData, engagementData, salesData, rawData: rawData };
    } catch (error) {
        console.error(`Error fetching ${platform} data:`, error);
        console.log(`Failed to load ${platform} data. Please check the server connection and data source.`);
        return null;
    }
}

/**
 * Fetches top performers (products by sales) data from the backend API.
 * @returns {Promise<Array>} An array of top performers, or an empty array if an error occurs.
 */
async function fetchTopPerformersData() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/sales/top');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Top Performers API data:", data);
        return data; // Expected format: [{product_name: "...", sales: N}, ...]
    } catch (error) {
        console.error('Error fetching top performers data:', error);
        console.log('Failed to load top performers data. Please check the server connection and data source.');
        return [];
    }
}

/**
 * Updates the summary totals displayed in the small cards.
 * @param {Array<number>} reachData - Array of reach values.
 * @param {Array<number>} engagementData - Array of engagement values.
 * @param {Array<number>} salesData - Array of sales values.
 */
function updateSummaryTotals(reachData, engagementData, salesData) {
    const totalReach = reachData.reduce((a, b) => a + b, 0);
    const totalEngagement = engagementData.reduce((a, b) => a + b, 0);
    const totalSales = salesData.reduce((a, b) => a + b, 0);

    const summaryCard = document.querySelector('.row.g-3 > .col:nth-child(3) > .card');
    if (!summaryCard) {
        console.warn("Summary card not found.");
        return;
    }

    summaryCard.querySelectorAll('.small-card-value').forEach(el => el.remove());

    const smallCards = summaryCard.querySelectorAll('.small-card');
    if (smallCards.length === 3) {
        const reachValueEl = document.createElement('div');
        reachValueEl.className = 'small-card-value text-center fw-bold';
        reachValueEl.textContent = totalReach.toLocaleString();
        smallCards[0].appendChild(reachValueEl);

        const engagementValueEl = document.createElement('div');
        engagementValueEl.className = 'small-card-value text-center fw-bold';
        engagementValueEl.textContent = totalEngagement.toLocaleString();
        smallCards[1].appendChild(engagementValueEl);

        const salesValueEl = document.createElement('div');
        salesValueEl.className = 'small-card-value text-center fw-bold';
        salesValueEl.textContent = totalSales.toLocaleString();
        smallCards[2].appendChild(salesValueEl);
    } else {
        console.warn("Expected 3 small cards in summary, found:", smallCards.length);
    }
}

/**
 * Renders the Top Performers chart using Chart.js.
 * @param {Array<Object>} performersData - An array of objects, each with 'product_name' and 'sales'.
 */
function renderTopPerformersChart(performersData) {
    const topPerformersCtx = document.getElementById('topPerformersChart').getContext('2d');

    if (window.topPerformersChartInstance) {
        window.topPerformersChartInstance.destroy();
    }

    const labels = performersData.map(item => item.product_name);
    const data = performersData.map(item => item.sales);

    window.topPerformersChartInstance = new Chart(topPerformersCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales',
                data: data,
                backgroundColor: 'rgba(153, 102, 255, 0.6)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Sales'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Product'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.x !== null) {
                                label += new Intl.NumberFormat('en-US').format(context.parsed.x);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Main function to render all charts on the dashboard based on the selected platform.
 * @param {string} platform - The platform to display data for ('tiktok', 'facebook', or 'all').
 */
async function renderCharts(platform = 'all') { // Default to 'all'
    console.log(`Rendering charts for platform: ${platform}`); // Log selected platform

    // Fetch platform-specific data for Reach, Engagement, and Monthly Sales charts
    const platformData = await fetchPlatformData(platform);
    if (!platformData) {
        console.error("Could not fetch platform data, skipping chart rendering.");
        // Optionally, display a message on the charts if no data is available
        ['reachChart', 'engagementChart', 'salesChart'].forEach(chartId => {
            const canvas = document.getElementById(chartId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // You could draw "No data available" text here if desired
            }
        });
        return;
    }

    const { labels, reachData, engagementData, salesData } = platformData;

    // Render Reach Chart
    const reachCtx = document.getElementById('reachChart').getContext('2d');
    if (window.reachChartInstance) window.reachChartInstance.destroy();
    window.reachChartInstance = new Chart(reachCtx, {
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    // Render Engagement Chart
    const engagementCtx = document.getElementById('engagementChart').getContext('2d');
    if (window.engagementChartInstance) window.engagementChartInstance.destroy();
    window.engagementChartInstance = new Chart(engagementCtx, {
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    // Render Monthly Sales Chart
    const salesCtx = document.getElementById('salesChart').getContext('2d');
    if (window.salesChartInstance) window.salesChartInstance.destroy();
    window.salesChartInstance = new Chart(salesCtx, {
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    // Update summary totals in the small cards
    updateSummaryTotals(reachData, engagementData, salesData);

    // Fetch and render top performers chart (this chart is NOT platform-specific, so it's always fetched and rendered regardless of the platform filter)
    const topPerformersData = await fetchTopPerformersData();
    const topPerformersCard = document.querySelector('.row.g-3:nth-of-type(2) > .col-4 > .card');

    // Clear any previous "No data" messages or existing chart content
    if (topPerformersCard) {
        const existingMessage = topPerformersCard.querySelector('.no-data-message');
        if (existingMessage) {
            topPerformersCard.removeChild(existingMessage);
        }
    }

    if (topPerformersData && topPerformersData.length > 0) {
        renderTopPerformersChart(topPerformersData);
    } else {
        // Display a message if no top performers data is available
        if (topPerformersCard) {
            const noDataMessage = document.createElement('div');
            noDataMessage.className = 'text-center text-muted p-4 no-data-message';
            noDataMessage.textContent = 'No top performers data available.';
            topPerformersCard.appendChild(noDataMessage);
        }
        // Ensure the canvas is hidden or cleared if no data
        const topPerformersCanvas = document.getElementById('topPerformersChart');
        if (topPerformersCanvas) {
            const ctx = topPerformersCanvas.getContext('2d');
            ctx.clearRect(0, 0, topPerformersCanvas.width, topPerformersCanvas.height);
            if (window.topPerformersChartInstance) {
                window.topPerformersChartInstance.destroy();
            }
        }
    }
}

// Run after DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    // Initial render with 'all' platforms selected
    renderCharts('all');

    // Add event listener for the platform filter dropdown
    const platformFilterDropdown = document.getElementById('platformFilterDropdown');
    const dropdownItems = platformFilterDropdown.nextElementSibling.querySelectorAll('.dropdown-item');

    dropdownItems.forEach(item => {
        item.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent default link behavior
            const selectedPlatform = this.dataset.platform;
            platformFilterDropdown.textContent = `Platform: ${this.textContent}`; // Update button text
            renderCharts(selectedPlatform); // Re-render charts with the selected platform
        });
    });
});
