// Assume auth.js handles Firebase initialization and auth state
// window.currentUserTokenPromise is expected to be set by auth.js

import { logActivity } from "/js/auth.js"; // Import the logActivity function

let correlationData = {}; // Global variable to store fetched correlation results
let charts = {}; // Object to store Chart.js instances
let customAlertModalInstance = null; // Global instance for the custom alert modal

// Helper function to show a custom alert modal
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');

    if (!modalElement) {
        console.error("Custom alert modal element not found in the DOM.");
        // Fallback to native alert if modal element is missing (should not happen in production)
        alert(`${title}: ${message}`);
        return;
    }

    // Initialize the modal instance only once
    if (!customAlertModalInstance) {
        customAlertModalInstance = new bootstrap.Modal(modalElement);
    }

    const modalTitle = document.getElementById('customAlertModalLabel');
    const modalBody = document.getElementById('customAlertModalBody');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    customAlertModalInstance.show();
}

// Helper function to show or hide loading overlay for charts
function showChartLoadingOverlay(metricType, show) {
    const overlay = document.getElementById(`${metricType}LoadingOverlay`);
    const chartCanvas = document.getElementById(`${metricType}Chart`);
    if (overlay && chartCanvas) {
        overlay.style.display = show ? 'flex' : 'none';
        chartCanvas.style.opacity = show ? '0.5' : '1'; // Dim chart while loading
    }
}

/**
 * Destroys existing chart instance if it exists.
 * @param {string} chartId - The ID of the chart canvas element.
 */
function destroyChart(chartId) {
    if (charts[chartId]) {
        charts[chartId].destroy();
        charts[chartId] = null;
    }
}

/**
 * Creates and displays a correlation chart.
 * @param {string} chartId - The ID of the canvas element for the chart.
 * @param {string} title - The title of the chart.
 * @param {string} xLabel - Label for the X-axis.
 * @param {string} yLabel - Label for the Y-axis.
 * @param {Array} data - Array of data points {x, y}.
 * @param {number} correlationCoefficient - The calculated correlation coefficient.
 * @param {string} recommendationText - The recommendation text based on correlation.
 */
function createCorrelationChart(chartId, title, xLabel, yLabel, data, correlationCoefficient, recommendationText) {
    destroyChart(chartId); // Destroy existing chart before creating a new one

    const ctx = document.getElementById(chartId).getContext('2d');
    charts[chartId] = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Data Points',
                data: data,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                pointRadius: 5,
                pointHoverRadius: 7,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: { size: 16, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `(${xLabel}: ${context.raw.x.toFixed(2)}, ${yLabel}: ${context.raw.y.toFixed(2)})`;
                        }
                    }
                },
                // Annotation plugin might not be loaded or configured for this project.
                // Removing it to avoid potential errors if not fully set up.
                // annotation: {
                //     annotations: {
                //         line1: {
                //             type: 'line',
                //             mode: 'horizontal',
                //             scaleID: 'y',
                //             value: data.reduce((sum, d) => sum + d.y, 0) / data.length, // Avg Y value
                //             borderColor: 'rgb(255, 99, 132)',
                //             borderWidth: 1,
                //             borderDash: [5, 5],
                //             label: {
                //                 enabled: true,
                //                 content: 'Avg ' + yLabel,
                //                 position: 'end'
                //             }
                //         }
                //     }
                // }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: xLabel
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: yLabel
                    }
                }
            }
        }
    });

    // Update recommendation text
    const recommendationElement = document.getElementById(`${chartId.replace('Chart', '')}Recommendation`);
    if (recommendationElement) {
        recommendationElement.innerHTML = `<strong>Correlation Coefficient (Spearman): ${correlationCoefficient !== null ? correlationCoefficient : 'N/A'}</strong><br>${recommendationText}`;
    }
}

/**
 * Displays the correlation visualizations based on the fetched data.
 */
function displayCorrelations() {
    const correlations = correlationData.correlations || {};
    const recommendations = correlationData.recommendations || {};
    const chartData = correlationData.chart_data || []; // Get the raw chart data

    // Prepare data for each chart
    const engageReachData = chartData.map(d => ({ x: d.engagement, y: d.reach }));
    const engageSalesData = chartData.map(d => ({ x: d.engagement, y: d.sales }));
    const reachSalesData = chartData.map(d => ({ x: d.reach, y: d.sales }));

    // Engagement / Reach
    showChartLoadingOverlay('engageReach', true);
    if (engageReachData.length > 0) {
        createCorrelationChart(
            'engageReachChart',
            'Engagement vs. Reach',
            'Engagement',
            'Reach',
            engageReachData,
            correlations.engage_reach,
            recommendations.engage_reach
        );
    } else {
        showCustomAlert("No sufficient data for Engagement vs. Reach correlation.", "Data Missing");
        destroyChart('engageReachChart');
        document.getElementById('engageReachRecommendation').innerHTML = "<strong>No data available for this correlation.</strong>";
    }
    showChartLoadingOverlay('engageReach', false);

    // Engagement / Sales
    showChartLoadingOverlay('engageSales', true);
    if (engageSalesData.length > 0) {
        createCorrelationChart(
            'engageSalesChart',
            'Engagement vs. Sales',
            'Engagement',
            'Sales',
            engageSalesData,
            correlations.engage_sales,
            recommendations.engage_sales
        );
    } else {
        showCustomAlert("No sufficient data for Engagement vs. Sales correlation.", "Data Missing");
        destroyChart('engageSalesChart');
        document.getElementById('engageSalesRecommendation').innerHTML = "<strong>No data available for this correlation.</strong>";
    }
    showChartLoadingOverlay('engageSales', false);

    // Reach / Sales
    showChartLoadingOverlay('reachSales', true);
    if (reachSalesData.length > 0) {
        createCorrelationChart(
            'reachSalesChart',
            'Reach vs. Sales',
            'Reach',
            'Sales',
            reachSalesData,
            correlations.reach_sales,
            recommendations.reach_sales
        );
    } else {
        showCustomAlert("No sufficient data for Reach vs. Sales correlation.", "Data Missing");
        destroyChart('reachSalesChart');
        document.getElementById('reachSalesRecommendation').innerHTML = "<strong>No data available for this correlation.</strong>";
    }
    showChartLoadingOverlay('reachSales', false);
}


/**
 * Fetches correlation data from the backend API for a given date range.
 * @param {string} startDate - The start date in YYYY-MM-DD format (optional).
 * @param {string} endDate - The end date in YYYY-MM-DD format (optional).
 * @param {string} platform - The platform to filter by (e.g., 'facebook', 'tiktok', 'all').
 */
async function fetchCorrelationData(startDate = null, endDate = null, platform = 'all') {
    let url = "http://localhost:5000/api/correlation-analysis";
    const params = new URLSearchParams();
    if (startDate) {
        params.append('start_date', startDate);
    }
    if (endDate) {
        params.append('end_date', endDate);
    }
    if (platform && platform !== 'all') { // Only append if a specific platform is selected
        params.append('platform', platform);
    }
    if (params.toString()) {
        url += `?${params.toString()}`;
    }

    // Show loading overlays for all charts
    showChartLoadingOverlay('engageReach', true);
    showChartLoadingOverlay('engageSales', true);
    showChartLoadingOverlay('reachSales', true);

    try {
        const token = await window.currentUserTokenPromise;
        if (!token) {
            console.error("Authentication token not available. Please log in.");
            showCustomAlert("Authentication required. Please log in.", "Authentication Error");
            return;
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            logActivity("CORRELATION_DATA_FETCH_FAILED", `Failed to fetch correlation data. Error: ${error.message || response.statusText}`); // Log failure
            throw new Error(error.message || "Failed to fetch correlation data.");
        }

        correlationData = await response.json();
        console.log("Fetched correlation data:", correlationData);
        displayCorrelations(); // Display all charts immediately after fetching data
        document.getElementById('visualizationsContainer').style.display = 'flex'; // Ensure container is visible
        logActivity("CORRELATION_DATA_FETCH_SUCCESS", `Fetched and displayed correlation data for range ${startDate} to ${endDate}, platform ${platform}.`); // Log success

    } catch (error) {
        console.error("Error fetching correlation data:", error);
        showCustomAlert(`Error fetching correlation data: ${error.message}`, "Data Fetch Error");
        document.getElementById('visualizationsContainer').style.display = 'none'; // Hide visualizations on error
        // Error already logged above
    } finally {
        // Hide loading overlays regardless of success or failure
        showChartLoadingOverlay('engageReach', false);
        showChartLoadingOverlay('engageSales', false);
        showChartLoadingOverlay('reachSales', false);
    }
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Log the page view when the DOM is loaded and the token is available
    window.addEventListener('tokenAvailable', () => {
        logActivity("PAGE_VIEW", "Viewed Correlation Analysis page."); 
        console.log("Token available. Initializing correlation analysis data fetches.");
        
        const filterForm = document.getElementById('filterForm'); // Redefine if it's not global
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const platformFilterInput = document.getElementById('platformFilter');
        
        // Set default dates for the filter to a wider range that should contain data
        const today = new Date();
        const defaultStartDate = '2024-05-01'; 
        const defaultEndDate = today.toISOString().split('T')[0];

        startDateInput.value = defaultStartDate;
        endDateInput.value = defaultEndDate;

        fetchCorrelationData(startDateInput.value, endDateInput.value, platformFilterInput.value);
    }, { once: true });


    // Also, check if the token is already available (e.g., on subsequent page loads or after a quick login)
    if (window.currentUserToken) {
        logActivity("PAGE_VIEW", "Viewed Correlation Analysis page."); // Log page view here
        console.log("Authentication token already found. Initializing correlation analysis data fetches immediately.");
        
        const filterForm = document.getElementById('filterForm'); // Redefine if it's not global
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const platformFilterInput = document.getElementById('platformFilter');
        
        // Set default dates for the filter to a wider range that should contain data
        const today = new Date();
        const defaultStartDate = '2024-05-01'; 
        const defaultEndDate = today.toISOString().split('T')[0];

        startDateInput.value = defaultStartDate;
        endDateInput.value = defaultEndDate;
        
        fetchCorrelationData(startDateInput.value, endDateInput.value, platformFilterInput.value);
    } else {
        console.log("Waiting for authentication token for initial correlation analysis load...");
    }


    const filterForm = document.getElementById('filterForm');
    const toggleFilterButton = document.getElementById('toggleFilterButton');
    const closeFilterPanelButton = document.getElementById('closeFilterPanelButton');
    const filterPanel = document.getElementById('filterPanel');


    // Handle filter form submission
    filterForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent default form submission
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const platform = platformFilterInput.value;
        fetchCorrelationData(startDate, endDate, platform);
        filterPanel.classList.remove('filter-panel-open'); // Close panel after applying filters
        logActivity("CORRELATION_FILTER_APPLIED", `Applied filters: Start: ${startDate}, End: ${endDate}, Platform: ${platform}.`); // Log filter application
    });

    // Toggle filter panel visibility
    toggleFilterButton.addEventListener('click', () => {
        filterPanel.classList.toggle('filter-panel-open');
    });

    // Close filter panel using the 'X' button
    closeFilterPanelButton.addEventListener('click', () => {
        filterPanel.classList.remove('filter-panel-open');
    });
});
