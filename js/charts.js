// Utility to convert date string (YYYY-MM-DD) to month abbreviation and year
// e.g., "2023-11-15" becomes "Nov 2023"
function getMonthYearAbbreviation(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(dateStr);
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Merges two arrays of data, summing common date entries and including unique ones.
 * Assumes data objects have a 'date' property and numerical 'reach', 'engagement', 'sales' properties.
 * This function expects already normalized data (i.e., 'reach', 'engagement', 'sales' keys are present).
 * @param {Array<Object>} data1 - First array of normalized data.
 * @param {Array<Object>} data2 - Second array of normalized data.
 * @returns {Array<Object>} Merged and sorted data.
 */
function mergeData(data1, data2) {
    const mergedMap = new Map();

    // Process data1: Add items to map, using date as key.
    data1.forEach(item => {
        const date = item.date; // Expecting 'date' as it's normalized
        if (date) {
            mergedMap.set(date, {
                date: date,
                reach: (item.reach ?? 0),
                engagement: (item.engagement ?? 0),
                sales: (item.sales ?? 0)
            });
        }
    });

    // Process data2: Merge with existing entries or add new ones.
    data2.forEach(item => {
        const date = item.date; // Expecting 'date' as it's normalized
        if (date) {
            if (mergedMap.has(date)) {
                const existing = mergedMap.get(date);
                mergedMap.set(date, {
                    date: date,
                    reach: existing.reach + (item.reach ?? 0),
                    engagement: existing.engagement + (item.engagement ?? 0),
                    sales: existing.sales + (item.sales ?? 0)
                });
            } else {
                mergedMap.set(date, {
                    date: date,
                    reach: (item.reach ?? 0),
                    engagement: (item.engagement ?? 0),
                    sales: (item.sales ?? 0)
                });
            }
        }
    });

    // Convert map back to array and sort by date for chronological order.
    const mergedArray = Array.from(mergedMap.values());
    mergedArray.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log("Merged Data:", mergedArray);
    return mergedArray;
}

/**
 * Filters and aggregates data by month and year based on the selected time range.
 * This ensures that x-axis labels are unique (e.g., "Nov 2023" vs. "Nov 2024")
 * and data is summed for each month.
 * @param {Array<Object>} data - The normalized data array, typically daily.
 * @param {string} timeRange - The time range to filter ('last3months', 'last6months', 'lastYear', 'allTime').
 * @returns {Object} An object with aggregated labels, reachData, engagementData, and salesData.
 */
function filterAndAggregateData(data, timeRange) {
    let filteredData = [];
    const now = new Date();
    let startDate;

    // Determine the start date for filtering based on timeRange
    switch (timeRange) {
        case 'last3months':
            // Set startDate to the beginning of the month, 3 months ago from current month
            startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            break;
        case 'last6months':
            // Set startDate to the beginning of the month, 6 months ago from current month
            startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            break;
        case 'lastYear':
            // Set startDate to one year ago from the current date.
            // This is then used to filter daily data, which is then aggregated by month.
            startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            break;
        case 'allTime':
        default:
            startDate = null; // No date filtering, include all data
            break;
    }

    // Apply date filtering if a startDate is defined
    if (startDate) {
        filteredData = data.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate;
        });
    } else {
        filteredData = [...data]; // If 'allTime', use a copy of the original data
    }

    // Aggregate filtered data by month and year
    // The map key will be "YYYY-MM" to ensure unique month-year combinations
    const monthlyAggregatedData = new Map();

    filteredData.forEach(item => {
        const itemDate = new Date(item.date);
        const yearMonthKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyAggregatedData.has(yearMonthKey)) {
            monthlyAggregatedData.set(yearMonthKey, {
                reach: 0,
                engagement: 0,
                sales: 0
            });
        }
        const currentMonthData = monthlyAggregatedData.get(yearMonthKey);
        currentMonthData.reach += item.reach;
        currentMonthData.engagement += item.engagement;
        currentMonthData.sales += item.sales;
    });

    // Convert the aggregated map to an array and sort it by month and year
    const sortedAggregatedData = Array.from(monthlyAggregatedData.entries())
        .map(([key, value]) => ({ dateKey: key, ...value }))
        .sort((a, b) => {
            // Compare by year, then by month
            const [yearA, monthA] = a.dateKey.split('-').map(Number);
            const [yearB, monthB] = b.dateKey.split('-').map(Number);
            return new Date(yearA, monthA - 1) - new Date(yearB, monthB - 1);
        });

    // Prepare labels and datasets for Chart.js
    const labels = sortedAggregatedData.map(item => {
        // Construct a dummy date string to get the formatted month and year
        const [year, month] = item.dateKey.split('-').map(Number);
        return getMonthYearAbbreviation(`${year}-${String(month).padStart(2, '0')}-01`);
    });
    const reachData = sortedAggregatedData.map(item => item.reach);
    const engagementData = sortedAggregatedData.map(item => item.engagement);
    const salesData = sortedAggregatedData.map(item => item.sales);

    return { labels, reachData, engagementData, salesData };
}


/**
 * Fetches platform-specific data (TikTok, Facebook, or both) from the backend API
 * and normalizes it to have consistent 'reach', 'engagement', and 'sales' keys.
 * This function now returns the raw normalized data, which is then filtered and aggregated
 * by the `filterAndAggregateData` function in `renderCharts`.
 * @param {string} platform - The platform to fetch data for ('tiktok', 'facebook', or 'all').
 * @returns {Promise<Object|null>} An object containing the raw normalized data, or null if an error occurs.
 */
async function fetchPlatformData(platform) {
    let normalizedData = []; // To hold data with consistent 'reach', 'engagement', 'sales' keys

    try {
        if (platform === 'all') {
            console.log("Fetching data for All Platforms...");
            const [tiktokResponse, facebookResponse] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/tiktokdata'),
                fetch('http://127.0.0.1:5000/api/facebookdata')
            ]);

            let tiktokRawData = tiktokResponse.ok ? await tiktokResponse.json() : [];
            let facebookRawData = facebookResponse.ok ? await facebookResponse.json() : [];

            // Normalize TikTok data: map 'views' to 'reach', sum 'likes', 'comments', 'shares' to 'engagement'
            const normalizedTikTok = tiktokRawData.map(item => ({
                date: item.date,
                reach: item.views ?? 0,
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0),
                sales: 0 // TikTok data typically doesn't have direct sales, set to 0
            }));

            // Normalize Facebook data: map 'reach' from 'reach' and calculate 'engagement'
            const normalizedFacebook = facebookRawData.map(item => ({
                date: item.date || item.Date,
                reach: item.reach ?? item.Reach ?? 0,
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0), // Calculate engagement for Facebook
                sales: item.sales ?? item.Sales ?? 0
            }));

            normalizedData = mergeData(normalizedTikTok, normalizedFacebook);

        } else if (platform === 'tiktok') {
            console.log("Fetching data for TikTok...");
            const response = await fetch('http://127.0.0.1:5000/api/tiktokdata');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            let rawData = await response.json();
            normalizedData = rawData.map(item => ({
                date: item.date,
                reach: item.views ?? 0, // Map views to reach for TikTok
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0), // Sum for engagement
                sales: 0 // TikTok data typically doesn't have direct sales, set to 0
            }));

        } else if (platform === 'facebook') {
            console.log("Fetching data for Facebook...");
            const response = await fetch('http://127.0.0.1:5000/api/facebookdata');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            let rawData = await response.json();
            normalizedData = rawData.map(item => ({
                date: item.date || item.Date,
                reach: item.reach ?? item.Reach ?? 0,
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0), // Calculate engagement for Facebook
                sales: item.sales ?? item.Sales ?? 0
            }));
        } else {
            console.warn("Invalid platform selected:", platform);
            return null;
        }

        console.log(`Normalized ${platform} raw data:`, normalizedData);

        return { rawData: normalizedData }; // Return rawData for further processing
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

    const summaryCard = document.querySelector('.row.g-3 > .col-12 > .card');
    if (!summaryCard) {
        console.warn("Summary card not found.");
        return;
    }

    // Update text content of existing elements
    const reachValueEl = summaryCard.querySelector('#summaryTotalReach');
    const engagementValueEl = summaryCard.querySelector('#summaryTotalEngagement');
    const salesValueEl = summaryCard.querySelector('#summaryTotalSales');

    if (reachValueEl) reachValueEl.textContent = totalReach.toLocaleString();
    if (engagementValueEl) engagementValueEl.textContent = totalEngagement.toLocaleString();
    if (salesValueEl) salesValueEl.textContent = totalSales.toLocaleString();
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
                backgroundColor: 'linear-gradient(135deg, #7B68EE, #5A4CD1)', // Blue-purple gradient
                borderColor: 'rgba(123, 104, 238, 1)', // Solid color for border
                borderWidth: 1,
                borderRadius: 5, // Rounded bars
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // No legend for this chart
                },
                title: {
                    display: true,
                    text: 'Top Performers by Sales',
                    font: {
                        size: 16,
                        family: 'Roboto',
                        weight: 'bold'
                    },
                    color: '#333'
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 30, 0.9)', // Darker tooltip background
                    titleFont: { family: 'Roboto', weight: 'bold' },
                    bodyFont: { family: 'Roboto' },
                    padding: 10,
                    cornerRadius: 5,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.x !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(context.parsed.x);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)', // Lighter grid lines
                        drawBorder: false, // Hide border
                    },
                    ticks: {
                        font: { family: 'Roboto' },
                        color: '#666'
                    },
                    title: {
                        display: true,
                        text: 'Total Sales (USD)',
                        font: { family: 'Roboto', weight: 'bold' },
                        color: '#333'
                    }
                },
                y: {
                    grid: {
                        display: false, // Hide vertical grid lines
                        drawBorder: false,
                    },
                    ticks: {
                        font: { family: 'Roboto' },
                        color: '#333'
                    },
                    title: {
                        display: true,
                        text: 'Product Name',
                        font: { family: 'Roboto', weight: 'bold' },
                        color: '#333'
                    }
                }
            }
        },
        plugins: [{
            beforeInit: function(chart) {
                // Apply gradient to bars
                const originalDraw = chart.getDatasetMeta(0).controller.draw;
                chart.getDatasetMeta(0).controller.draw = function() {
                    originalDraw.apply(this, arguments);
                    const ctx = chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, chart.width, 0);
                    gradient.addColorStop(0, '#7B68EE'); // Start color
                    gradient.addColorStop(1, '#5A4CD1'); // End color
                    // Ensure 'this.get' was a typo and not needed for gradient application directly to bar options.
                    // If 'this.get' was meant to be a method call, it needs to be corrected.
                    chart.getDatasetMeta(0).data.forEach(bar => {
                        bar.options.backgroundColor = gradient;
                    });
                };
            }
        }]
    });
}

/**
 * Main function to render all charts on the dashboard based on the selected platform and time range.
 * @param {string} platform - The platform to display data for ('tiktok', 'facebook', or 'all').
 * @param {string} timeRange - The time range to filter data ('last3months', 'last6months', 'lastYear', 'allTime').
 */
async function renderCharts(platform = 'all', timeRange = 'lastYear') { // Default to 'all' platforms and 'lastYear' time range
    console.log(`Rendering charts for platform: ${platform}, time range: ${timeRange}`);

    // Fetch platform-specific data. This now returns raw data.
    const platformData = await fetchPlatformData(platform);
    if (!platformData || !platformData.rawData) {
        console.error("Could not fetch platform raw data, skipping chart rendering.");
        // Clear canvases and display a message if no data is available
        ['reachChart', 'engagementChart', 'salesChart'].forEach(chartId => {
            const canvas = document.getElementById(chartId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // Optional: Draw "No data available" text here
            }
        });
        return;
    }

    // Filter and aggregate the raw data based on the selected time range.
    // This is where daily data is grouped into unique month-year entries.
    const { labels, reachData, engagementData, salesData } = filterAndAggregateData(platformData.rawData, timeRange);

    // Common Chart.js options for all charts
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false, // Hide legend by default
                labels: {
                    font: { family: 'Roboto' }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.9)', // Darker tooltip background
                titleFont: { family: 'Roboto', weight: 'bold' },
                bodyFont: { family: 'Roboto' },
                padding: 10,
                cornerRadius: 5,
            },
            title: {
                display: true,
                font: {
                    size: 16,
                    family: 'Roboto',
                    weight: 'bold'
                },
                color: '#333'
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)', // Lighter grid lines
                    drawBorder: false,
                },
                ticks: {
                    font: { family: 'Roboto' },
                    color: '#666',
                    // Labels are already "MMM YYYY", so no custom callback is needed to format them further.
                    // This allows Chart.js to display the labels directly.
                },
                title: {
                    display: true,
                    font: { family: 'Roboto', weight: 'bold' },
                    color: '#333'
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)', // Lighter grid lines
                    drawBorder: false,
                },
                ticks: {
                    font: { family: 'Roboto' },
                    color: '#666',
                    callback: function(value) {
                        // Format large numbers for Y-axis (e.g., 1000000 -> 1M)
                        if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                        if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                        return value;
                    }
                },
                title: {
                    display: true,
                    font: { family: 'Roboto', weight: 'bold' },
                    color: '#333'
                }
            }
        }
    };


    // Render Reach Chart (Bar Chart)
    const reachCtx = document.getElementById('reachChart').getContext('2d');
    if (window.reachChartInstance) window.reachChartInstance.destroy();
    window.reachChartInstance = new Chart(reachCtx, {
        type: 'bar',
        data: {
            labels, // Use aggregated labels
            datasets: [{
                label: 'Reach',
                data: reachData, // Use aggregated data
                backgroundColor: 'rgba(123, 104, 238, 0.7)',
                borderColor: 'rgba(123, 104, 238, 1)',
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    ...commonOptions.plugins.title,
                    text: 'Monthly Reach'
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US').format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...commonOptions.scales.x,
                    title: { ...commonOptions.scales.x.title, text: 'Month and Year' } // Updated title
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Reach' }
                }
            }
        }
    });

    // Render Engagement Chart (Line Chart)
    const engagementCtx = document.getElementById('engagementChart').getContext('2d');
    if (window.engagementChartInstance) window.engagementChartInstance.destroy();
    window.engagementChartInstance = new Chart(engagementCtx, {
        type: 'line',
        data: {
            labels, // Use aggregated labels
            datasets: [{
                label: 'Engagement',
                data: engagementData, // Use aggregated data
                fill: true,
                backgroundColor: 'rgba(90, 76, 209, 0.2)',
                borderColor: 'rgba(90, 76, 209, 1)',
                tension: 0.4,
                pointBackgroundColor: 'rgba(90, 76, 209, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(90, 76, 209, 1)',
                pointRadius: 5,
                pointHoverRadius: 7,
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    ...commonOptions.plugins.title,
                    text: 'Monthly Engagement'
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US').format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...commonOptions.scales.x,
                    title: { ...commonOptions.scales.x.title, text: 'Month and Year' } // Updated title
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Engagement' }
                }
            }
        }
    });

    // Render Monthly Sales Chart (Bar Chart)
    const salesCtx = document.getElementById('salesChart').getContext('2d');
    if (window.salesChartInstance) window.salesChartInstance.destroy();
    window.salesChartInstance = new Chart(salesCtx, {
        type: 'bar',
        data: {
            labels, // Use aggregated labels
            datasets: [{
                label: 'Sales',
                data: salesData, // Use aggregated data
                backgroundColor: 'rgba(170, 150, 250, 0.7)',
                borderColor: 'rgba(170, 150, 250, 1)',
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    ...commonOptions.plugins.title,
                    text: 'Monthly Sales'
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...commonOptions.scales.x,
                    title: { ...commonOptions.scales.x.title, text: 'Month and Year' } // Updated title
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Sales (USD)' }
                }
            }
        }
    });


    // Update summary totals in the small cards
    updateSummaryTotals(reachData, engagementData, salesData);

    // Fetch and render top performers chart (this chart is NOT platform-specific, so it's always fetched and rendered)
    const topPerformersData = await fetchTopPerformersData();
    const topPerformersCard = document.querySelector('.row.g-3 > .col-md-4 > .card');

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
    // Initial render with 'all' platforms selected and 'lastYear' time range by default
    renderCharts('all', 'lastYear');

    // Add event listener for the platform filter dropdown
    const platformFilterDropdown = document.getElementById('platformFilterDropdown');
    if (platformFilterDropdown) {
        const dropdownMenu = platformFilterDropdown.nextElementSibling;
        if (dropdownMenu) {
            const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');

            dropdownItems.forEach(item => {
                item.addEventListener('click', function(event) {
                    event.preventDefault(); // Prevent default link behavior
                    const selectedPlatform = this.dataset.platform;
                    platformFilterDropdown.textContent = `Platform: ${this.textContent}`; // Update button text
                    platformFilterDropdown.dataset.platform = selectedPlatform; // Store selected platform
                    // Get current time range to preserve it when platform changes
                    const currentTimeRangeDropdown = document.getElementById('timeRangeFilterDropdown');
                    const currentTimeRange = currentTimeRangeDropdown ? currentTimeRangeDropdown.dataset.timeRange : 'lastYear'; // Default if not found
                    renderCharts(selectedPlatform, currentTimeRange); // Re-render charts with selected platform and current time range
                });
            });
        } else {
            console.warn("Platform filter dropdown menu not found. Check HTML structure for platformFilterDropdown.");
        }
    } else {
        console.warn("Platform filter dropdown button not found. Check HTML structure.");
    }

    // Add event listener for the time range filter dropdown
    const timeRangeFilterDropdown = document.getElementById('timeRangeFilterDropdown');
    if (timeRangeFilterDropdown) {
        const dropdownMenu = timeRangeFilterDropdown.nextElementSibling;
        if (dropdownMenu) {
            const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');

            dropdownItems.forEach(item => {
                item.addEventListener('click', function(event) {
                    event.preventDefault(); // Prevent default link behavior
                    const selectedTimeRange = this.dataset.timeRange;
                    timeRangeFilterDropdown.textContent = `Time: ${this.textContent}`; // Update button text
                    timeRangeFilterDropdown.dataset.timeRange = selectedTimeRange; // Store selected time range
                    // Get current platform to preserve it when time range changes
                    const currentPlatformDropdown = document.getElementById('platformFilterDropdown');
                    const currentPlatform = currentPlatformDropdown ? currentPlatformDropdown.dataset.platform : 'all'; // Default if not found
                    renderCharts(currentPlatform, selectedTimeRange); // Re-render charts with current platform and selected time range
                });
            });
        } else {
            console.warn("Time range filter dropdown menu not found. Check HTML structure for timeRangeFilterDropdown.");
        }
    } else {
        console.warn("Time range filter dropdown button not found. Check HTML structure.");
    }
});
