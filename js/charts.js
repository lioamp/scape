// Utility to convert date string (YYYY-MM-DD) to month abbreviation
function getMonthAbbreviation(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(dateStr);
    return months[date.getMonth()];
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

    // Process data1
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

    // Process data2, merging with existing or adding new
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

    // Convert map back to array and sort by date
    const mergedArray = Array.from(mergedMap.values());
    mergedArray.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log("Merged Data:", mergedArray); // Added console log for merged data
    return mergedArray;
}

/**
 * Fetches platform-specific data (TikTok, Facebook, or both) from the backend API
 * and normalizes it to have consistent 'reach', 'engagement', and 'sales' keys.
 * @param {string} platform - The platform to fetch data for ('tiktok', 'facebook', or 'all').
 * @returns {Promise<Object|null>} An object containing labels, reachData, engagementData, salesData, and rawData, or null if an error occurs.
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

        console.log(`Normalized ${platform} data for charts:`, normalizedData);

        // Map normalized data to chart-friendly formats
        const labels = normalizedData.map(row => row.date); // Keep full date for parsing in adapter
        const reachData = normalizedData.map(row => row.reach);
        const engagementData = normalizedData.map(row => row.engagement);
        const salesData = normalizedData.map(row => row.sales);

        return { labels, reachData, engagementData, salesData, rawData: normalizedData };
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

    const summaryCard = document.querySelector('.row.g-3 > .col-12 > .card'); // Corrected selector for the summary card
    if (!summaryCard) {
        console.warn("Summary card not found.");
        return;
    }

    // Update text content of existing elements instead of removing and recreating
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
                    this.get
                    chart.getDatasetMeta(0).data.forEach(bar => {
                        bar.options.backgroundColor = gradient;
                    });
                };
            }
        }]
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
                    callback: function(val, index) {
                        // Display month abbreviation for x-axis labels
                        return getMonthAbbreviation(this.getLabelForValue(val));
                    }
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
                        // Format large numbers for Y-axis
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
            labels,
            datasets: [{
                label: 'Reach',
                data: reachData,
                backgroundColor: 'rgba(123, 104, 238, 0.7)', // Blue-purple with transparency
                borderColor: 'rgba(123, 104, 238, 1)', // Solid blue-purple
                borderWidth: 1,
                borderRadius: 5, // Rounded bars
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
                    title: { ...commonOptions.scales.x.title, text: 'Month' }
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
            labels,
            datasets: [{
                label: 'Engagement',
                data: engagementData,
                fill: true, // Fill area under the line
                backgroundColor: 'rgba(90, 76, 209, 0.2)', // Lighter blue-purple for fill
                borderColor: 'rgba(90, 76, 209, 1)', // Solid blue-purple for line
                tension: 0.4, // Smoother line
                pointBackgroundColor: 'rgba(90, 76, 209, 1)', // Point color
                pointBorderColor: '#fff', // Point border color
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(90, 76, 209, 1)',
                pointRadius: 5, // Larger points
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
                    title: { ...commonOptions.scales.x.title, text: 'Month' }
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
            labels,
            datasets: [{
                label: 'Sales',
                data: salesData,
                backgroundColor: 'rgba(170, 150, 250, 0.7)', // Lighter blue-purple for sales bars
                borderColor: 'rgba(170, 150, 250, 1)', // Solid lighter blue-purple
                borderWidth: 1,
                borderRadius: 5, // Rounded bars
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
                    title: { ...commonOptions.scales.x.title, text: 'Month' }
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Sales (USD)' }
                }
            }
        }
    });


    // Update summary totals in the small cards (this function is in your Chart.js utility file)
    updateSummaryTotals(reachData, engagementData, salesData);

    // Fetch and render top performers chart (this chart is NOT platform-specific, so it's always fetched and rendered regardless of the platform filter)
    const topPerformersData = await fetchTopPerformersData();
    const topPerformersCard = document.querySelector('.row.g-3 > .col-md-4 > .card'); // Adjusted selector

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
    // Ensure platformFilterDropdown actually exists before trying to access its nextSibling
    if (platformFilterDropdown) {
        const dropdownMenu = platformFilterDropdown.nextElementSibling;
        if (dropdownMenu) {
            const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');

            dropdownItems.forEach(item => {
                item.addEventListener('click', function(event) {
                    event.preventDefault(); // Prevent default link behavior
                    const selectedPlatform = this.dataset.platform;
                    platformFilterDropdown.textContent = `Platform: ${this.textContent}`; // Update button text
                    renderCharts(selectedPlatform); // Re-render charts with the selected platform
                });
            });
        } else {
            console.warn("Dropdown menu not found. Check HTML structure for platformFilterDropdown.");
        }
    } else {
        console.warn("Platform filter dropdown button not found. Check HTML structure.");
    }
});
