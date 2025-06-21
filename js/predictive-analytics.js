// predictive-analytics.js

// Chart instances to prevent recreation issues
let engagementChartInstance = null;
let reachChartInstance = null;
let salesChartInstance = null;

// Global state for filters
let currentMetricType = 'sales'; // Default metric to display on load
const fixedForecastYears = 3; // Fixed forecast period to 3 years

/**
 * Shows a custom alert modal instead of the browser's alert.
 * @param {string} message The message to display.
 * @param {string} title The title of the modal (optional).
 */
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');
    const modalTitle = document.getElementById('customAlertModalLabel');
    const modalBody = document.getElementById('customAlertModalBody');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

/**
 * Shows or hides the loading indicator.
 * @param {boolean} show True to show, false to hide.
 */
function showLoadingIndicator(show) {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        if (show) {
            indicator.classList.remove('d-none');
        } else {
            indicator.classList.add('d-none');
        }
    }
}


/**
 * Fetches predictive data for a given metric type from the backend.
 * @param {string} metricType 'sales', 'engagement', or 'reach'.
 * @param {number} forecastYears The fixed number of years to forecast (e.g., 3).
 * @returns {Promise<object|null>} The data object containing historical data, forecast data, and recommendation, or null on error.
 */
async function fetchPredictiveData(metricType, forecastYears) {
    showLoadingIndicator(true); // Show loading indicator

    try {
        const token = window.currentUserToken; // Get token from global scope set by auth.js
        console.log("Fetching predictive data. Current token:", token ? "Available" : "NOT available");

        if (!token) {
            showCustomAlert("Authentication token not available. Please log in.", "Authentication Required");
            showLoadingIndicator(false);
            return null;
        }

        const API_BASE_URL = "http://127.0.0.1:5000/api"; // Your Flask backend URL
        const response = await fetch(`${API_BASE_URL}/predictive-analytics?metric_type=${metricType}&forecast_years=${forecastYears}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Predictive data for ${metricType} (fixed forecast of ${forecastYears} years):`, data);
        return data;

    } catch (error) {
        console.error('Error fetching predictive data:', error);
        showCustomAlert(`Error loading predictive data: ${error.message}`, "Data Load Error");
        return null;
    } finally {
        showLoadingIndicator(false); // Hide loading indicator
    }
}


/**
 * Renders the Chart.js chart for a given metric.
 * @param {string} chartId The ID of the canvas element.
 * @param {object} chartInstance The existing chart instance (can be null).
 * @param {Array<object>} historicalData Array of {year, value} for historical data.
 * @param {Array<object>} forecastData Array of {year, value, lower_bound, upper_bound} for forecast data.
 * @param {string} label The label for the chart (e.g., "Combined Engagement").
 * @param {string} unit The unit for the Y-axis (e.g., "", "$").
 * @returns {object} The new or updated chart instance.
 */
function renderChart(chartId, chartInstance, historicalData, forecastData, label, unit = '') {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas with ID '${chartId}' not found.`);
        return null;
    }

    if (chartInstance) {
        chartInstance.destroy(); // Destroy existing chart instance to prevent memory leaks/overlaps
    }

    const allYears = [...new Set([
        ...historicalData.map(d => d.year),
        ...forecastData.map(d => d.year)
    ])].sort((a, b) => a - b);

    const historicalValues = historicalData.map(d => d.value);
    const forecastValues = forecastData.map(d => d.value);
    const lowerBounds = forecastData.map(d => d.lower_bound);
    const upperBounds = forecastData.map(d => d.upper_bound);

    const fullDatasetValues = [];
    const fullLowerBounds = [];
    const fullUpperBounds = [];

    // Map allYears to corresponding historical or forecast values
    allYears.forEach(year => {
        const hist = historicalData.find(d => d.year === year);
        const forecast = forecastData.find(d => d.year === year);

        if (hist) {
            fullDatasetValues.push(hist.value);
            fullLowerBounds.push(null); // No confidence interval for historical data
            fullUpperBounds.push(null);
        } else if (forecast) {
            fullDatasetValues.push(forecast.value);
            fullLowerBounds.push(forecast.lower_bound);
            fullUpperBounds.push(forecast.upper_bound);
        } else {
            fullDatasetValues.push(null); // No data for this year
            fullLowerBounds.push(null);
            fullUpperBounds.push(null);
        }
    });

    // Create a dataset for the historical values, padding with nulls for future years
    const historicalPlotData = allYears.map(year => {
        const dataPoint = historicalData.find(d => d.year === year);
        return dataPoint ? dataPoint.value : null;
    });

    // Create a dataset for the forecast values, padding with nulls for past years
    const forecastPlotData = allYears.map(year => {
        const dataPoint = forecastData.find(d => d.year === year);
        return dataPoint ? dataPoint.value : null;
    });
    
    // Confidence interval data - needs to align with forecastPlotData
    const confidenceLowerPlotData = allYears.map(year => {
        const dataPoint = forecastData.find(d => d.year === year);
        return dataPoint ? dataPoint.lower_bound : null;
    });

    const confidenceUpperPlotData = allYears.map(year => {
        const dataPoint = forecastData.find(d => d.year === year);
        return dataPoint ? dataPoint.upper_bound : null;
    });


    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allYears,
            datasets: [
                {
                    label: `Historical ${label}`,
                    data: historicalPlotData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    pointRadius: 3,
                    fill: false,
                    tension: 0.4 // Smooth the line
                },
                {
                    label: `Forecasted ${label}`,
                    data: forecastPlotData,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 2,
                    borderDash: [5, 5], // Dashed line for forecast
                    pointRadius: 3,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Lower Bound',
                    data: confidenceLowerPlotData,
                    borderColor: 'rgba(75, 192, 192, 0)', // Transparent border
                    backgroundColor: 'rgba(75, 192, 192, 0.1)', // Light fill for confidence area
                    pointRadius: 0,
                    fill: '+1', // Fill from this dataset to the next one
                    hidden: false // Keep hidden for the fill to work, but no line
                },
                {
                    label: 'Upper Bound',
                    data: confidenceUpperPlotData,
                    borderColor: 'rgba(75, 192, 192, 0)', // Transparent border
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    pointRadius: 0,
                    fill: '-1', // Fill from this dataset to the previous one
                    hidden: false // Keep hidden
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year'
                    },
                    type: 'category', // Ensure years are treated as categories
                    labels: allYears
                },
                y: {
                    title: {
                        display: true,
                        text: `${label} ${unit}`
                    },
                    beginAtZero: true,
                    ticks: {
                        callback: function(value, index, values) {
                            // Format large numbers for readability
                            if (value >= 1000000) {
                                return value / 1000000 + 'M';
                            } else if (value >= 1000) {
                                return value / 1000 + 'K';
                            }
                            return value;
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString();
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        filter: function(item, chart) {
                            // Hide "Lower Bound" and "Upper Bound" from the legend
                            return item.text !== 'Lower Bound' && item.text !== 'Upper Bound';
                        }
                    }
                }
            }
        }
    });
    return chartInstance;
}


/**
 * Hides all visualization containers.
 */
function hideAllVisualizations() {
    document.querySelectorAll('.visualization').forEach(el => {
        el.classList.add('d-none');
    });
}

/**
 * Displays the selected visualization.
 * @param {string} metricType The type of metric to display ('engagement', 'reach', 'sales').
 */
async function showVisualization(metricType) {
    hideAllVisualizations(); // Hide all charts first
    currentMetricType = metricType; // Update global state

    const container = document.getElementById(`${metricType}-container`);
    const recommendationElement = document.getElementById(`${metricType}Recommendation`);
    const chartCanvas = document.getElementById(`${metricType}Chart`);

    if (container) container.classList.remove('d-none'); // Show the relevant container

    const data = await fetchPredictiveData(metricType, fixedForecastYears); // Use fixedForecastYears

    if (data && data.historical_data && data.forecast_data) {
        const historicalData = data.historical_data;
        const forecastData = data.forecast_data;
        const recommendation = data.recommendation;

        let chartLabel = '';
        let chartUnit = '';
        let currentChartInstance = null;

        if (metricType === 'engagement') {
            chartLabel = 'Combined Engagement';
            chartUnit = '';
            currentChartInstance = engagementChartInstance;
        } else if (metricType === 'reach') {
            chartLabel = 'Combined Reach';
            chartUnit = '';
            currentChartInstance = reachChartInstance;
        } else if (metricType === 'sales') {
            chartLabel = 'Sales Revenue';
            chartUnit = '$';
            currentChartInstance = salesChartInstance;
        }

        // Render the chart
        const newChartInstance = renderChart(
            `${metricType}Chart`,
            currentChartInstance,
            historicalData,
            forecastData,
            chartLabel,
            chartUnit
        );

        // Update the global chart instance reference
        if (metricType === 'engagement') {
            engagementChartInstance = newChartInstance;
        } else if (metricType === 'reach') {
            reachChartInstance = newChartInstance;
        } else if (metricType === 'sales') {
            salesChartInstance = newChartInstance;
        }

        if (recommendationElement) {
            recommendationElement.textContent = recommendation;
        }
    } else {
        // If data fetching failed or returned no data, ensure charts are hidden and message is shown
        if (chartCanvas) {
            if (metricType === 'engagement' && engagementChartInstance) {
                engagementChartInstance.destroy();
                engagementChartInstance = null;
            } else if (metricType === 'reach' && reachChartInstance) {
                reachChartInstance.destroy();
                reachChartInstance = null;
            } else if (metricType === 'sales' && salesChartInstance) {
                salesChartInstance.destroy();
                salesChartInstance = null;
            }
            chartCanvas.style.display = 'none'; // Hide canvas
        }
        if (recommendationElement) {
            recommendationElement.textContent = 'Failed to load predictive data or generate recommendation.';
        }
    }
}

// Function to handle the initial display of the predictive chart
function initializePredictiveDisplay() {
    // Check for currentUserToken after auth.js has loaded and authenticated
    const checkTokenInterval = setInterval(() => {
        if (window.currentUserToken) {
            clearInterval(checkTokenInterval);
            console.log("Authentication token found. Displaying default sales visualization.");
            // Trigger a default visualization display here, e.g., Sales chart on load:
            showVisualization(currentMetricType); 
        } else {
            console.log("Waiting for authentication token...");
        }
    }, 500); // Check every 500ms
}


document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners to the cards
    document.getElementById('cardEngagement')?.addEventListener('click', () => showVisualization('engagement'));
    document.getElementById('cardReach')?.addEventListener('click', () => showVisualization('reach'));
    document.getElementById('cardSales')?.addEventListener('click', () => showVisualization('sales'));

    // No event listener needed for the forecast period dropdown as it's removed.

    // Initialize the predictive display
    initializePredictiveDisplay();
});
