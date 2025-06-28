// predictive-analytics.js

// Import the logActivity function
import { logActivity } from "/js/auth.js"; 

// Chart instances to prevent recreation issues
let engagementChartInstance = null;
let reachChartInstance = null;
let salesChartInstance = null;

// Global state for filters
const fixedForecastMonths = 36; // Fixed forecast period to 36 months (3 years)

// Cache for predictive data to avoid re-fetching and re-training on every click
const predictiveDataCache = {};
const CACHE_EXPIRATION_MS = 5 * 60 * 1000; // Cache data for 5 minutes

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
 * Shows or hides the loading overlay for a specific chart container,
 * and hides/shows the canvas accordingly.
 * @param {string} metricType The type of metric ('engagement', 'reach', 'sales').
 * @param {boolean} show True to show loading overlay, false to hide.
 */
function showChartLoadingOverlay(metricType, show) {
    const overlay = document.getElementById(`${metricType}LoadingOverlay`);
    const chartCanvas = document.getElementById(`${metricType}Chart`);
    if (overlay && chartCanvas) {
        if (show) {
            overlay.classList.remove('d-none');
            overlay.style.display = 'flex'; // Ensure flex to center spinner
            chartCanvas.classList.add('d-none'); // Hide canvas while loading
        } else {
            overlay.classList.add('d-none');
            overlay.style.display = 'none';
            chartCanvas.classList.remove('d-none'); // Show canvas when loading is done
        }
    }
}


/**
 * Utility to convert date string (YYYY-MM-DD) to month abbreviation and year
 * e.g., "2023-11-15" becomes "Nov 2023"
 * This function is already present in dashboard-utils.js, but duplicated here for self-containment
 * for the predictive analytics page, as it's not directly importing utils.
 */
function getMonthYearAbbreviation(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(dateStr);
    // Use getUTCMonth and getUTCFullYear to avoid timezone issues affecting the year for "YYYY-01-01" dates
    return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}


/**
 * Fetches predictive data for a given metric type from the backend,
 * or retrieves it from cache if available and fresh.
 * @param {string} metricType 'sales', 'engagement', or 'reach'.
 * @param {number} forecastMonths The fixed number of months to forecast (e.g., 36).
 * @returns {Promise<object|null>} The data object containing historical data, forecast data, and recommendation, or null on error.
 */
async function fetchPredictiveData(metricType, forecastMonths) {
    const cacheKey = `${metricType}-${forecastMonths}`;

    // Show loading overlay for this specific chart BEFORE checking cache
    showChartLoadingOverlay(metricType, true);

    if (predictiveDataCache[cacheKey] && (Date.now() - predictiveDataCache[cacheKey].timestamp < CACHE_EXPIRATION_MS)) {
        console.log(`Using cached predictive data for ${metricType}.`);
        showChartLoadingOverlay(metricType, false); // Hide overlay quickly if from cache
        return predictiveDataCache[cacheKey].data;
    }

    try {
        const token = window.currentUserToken;
        console.log(`Fetching predictive data for ${metricType}. Current token:`, token ? "Available" : "NOT available");

        if (!token) {
            showCustomAlert("Authentication token not available. Please log in.", "Authentication Required");
            return null;
        }

        const API_BASE_URL = "http://127.0.0.1:5000/api";
        const response = await fetch(`${API_BASE_URL}/predictive-analytics?metric_type=${metricType}&forecast_months=${forecastMonths}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Predictive data for ${metricType} (fixed forecast of ${forecastMonths} months):`, data);

        // --- IMPORTANT FIX: Convert 'year' to 'date' string for frontend charting ---
        const processedHistoricalData = data.historical_data.map(item => ({
            date: `${item.year}-01-01`, // Convert year to a standardized date string
            value: item.value
        }));

        const processedForecastData = data.forecast_data.map(item => ({
            date: `${item.year}-01-01`, // Convert year to a standardized date string
            value: item.value,
            lower_bound: item.lower_bound,
            upper_bound: item.upper_bound
        }));

        const processedData = {
            historical_data: processedHistoricalData,
            forecast_data: processedForecastData,
            recommendation: data.recommendation,
            message: data.message
        };
        // --- END FIX ---

        predictiveDataCache[cacheKey] = {
            data: processedData, // Store processed data in cache
            timestamp: Date.now()
        };

        return processedData; // Return processed data

    } catch (error) {
        console.error('Error fetching predictive data:', error);
        showCustomAlert(`Error loading predictive data for ${metricType}: ${error.message}`, "Data Load Error");
        logActivity("PREDICTIVE_DATA_LOAD_ERROR", `Failed to load predictive data for ${metricType}: ${error.message}`); // Log error
        return null;
    } finally {
        // This finally block will run after try/catch, hiding the overlay.
        showChartLoadingOverlay(metricType, false); 
    }
}


/**
 * Renders the Chart.js chart for a given metric.
 * @param {string} chartId The ID of the canvas element.
 * @param {object} chartInstance The existing chart instance (can be null).
 * @param {Array<object>} historicalData Array of {date, value} for historical data.
 * @param {Array<object>} forecastData Array of {date, value, lower_bound, upper_bound} for forecast data.
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

    // Combine all dates from historical and forecast data, ensure unique and sort them
    const allDates = [...new Set([
        ...historicalData.map(d => d.date),
        ...forecastData.map(d => d.date)
    ])].sort((a, b) => new Date(a) - new Date(b));

    const historicalPlotData = allDates.map(date => {
        const dataPoint = historicalData.find(d => d.date === date);
        return dataPoint ? dataPoint.value : null;
    });

    const forecastPlotData = allDates.map(date => {
        const dataPoint = forecastData.find(d => d.date === date);
        return dataPoint ? dataPoint.value : null;
    });

    const confidenceLowerPlotData = allDates.map(date => {
        const dataPoint = forecastData.find(d => d.date === date);
        return dataPoint ? dataPoint.lower_bound : null;
    });

    const confidenceUpperPlotData = allDates.map(date => {
        const dataPoint = forecastData.find(d => d.date === date);
        return dataPoint ? dataPoint.upper_bound : null;
    });

    const formattedLabels = allDates.map(date => getMonthYearAbbreviation(date));


    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [
                {
                    label: `Historical ${label}`,
                    data: historicalPlotData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    pointRadius: 3,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: `Forecasted ${label}`,
                    data: forecastPlotData,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 3,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Lower Bound',
                    data: confidenceLowerPlotData,
                    borderColor: 'rgba(75, 192, 192, 0)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    pointRadius: 0,
                    fill: '+1',
                    hidden: false
                },
                {
                    label: 'Upper Bound',
                    data: confidenceUpperPlotData,
                    borderColor: 'rgba(75, 192, 192, 0)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    pointRadius: 0,
                    fill: '-1',
                    hidden: false
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
                        text: 'Month and Year'
                    },
                    type: 'category',
                    labels: formattedLabels
                },
                y: {
                    title: {
                        display: true,
                        text: `${label} ${unit}`
                    },
                    beginAtZero: true,
                    ticks: {
                        callback: function(value, index, values) {
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
                                if (chartId === 'salesChart') {
                                    label += new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(context.parsed.y);
                                } else {
                                    label += context.parsed.y.toLocaleString();
                                }
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
 * Handles the display and rendering of a single visualization chart.
 * Manages its own loading overlay and ensures the canvas is visible only when loaded.
 * @param {string} metricType The type of metric to display ('engagement', 'reach', 'sales').
 */
async function showVisualization(metricType) {
    const recommendationElement = document.getElementById(`${metricType}Recommendation`);
    const chartCanvas = document.getElementById(`${metricType}Chart`);

    // The loading overlay is shown by fetchPredictiveData before it proceeds.
    // The canvas is hidden when the overlay is shown (via showChartLoadingOverlay).

    const data = await fetchPredictiveData(metricType, fixedForecastMonths);

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

        const newChartInstance = renderChart(
            `${metricType}Chart`,
            currentChartInstance,
            historicalData,
            forecastData,
            chartLabel,
            chartUnit
        );

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

        // Hide overlay and show canvas (handled within showChartLoadingOverlay)
        showChartLoadingOverlay(metricType, false);
    } else {
        // Handle error state: destroy chart, hide canvas, update recommendation
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
            chartCanvas.classList.add('d-none'); // Ensure canvas is hidden if data fails
        }
        if (recommendationElement) {
            recommendationElement.textContent = 'Failed to load predictive data or generate recommendation.';
        }
        // Always hide the loading overlay, even on error.
        showChartLoadingOverlay(metricType, false);
    }
}

/**
 * Initializes and displays all predictive charts on page load.
 * This function will fetch data for all three metrics concurrently.
 */
async function initializeAllChartsOnLoad() {
    const metricsToLoad = ['engagement', 'reach', 'sales'];
    // Directly call showVisualization for each metric, which handles its own loading state
    const fetchPromises = metricsToLoad.map(metricType => showVisualization(metricType));

    try {
        await Promise.all(fetchPromises);
        console.log("All predictive charts initialization attempts complete.");
    } catch (error) {
        console.error("An unexpected error occurred during the initialization of all predictive charts:", error);
        logActivity("PREDICTIVE_INIT_ERROR", `Error during chart initialization: ${error.message}`); // Log error
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Wait for the authentication token to be available before trying to fetch data
    const checkTokenInterval = setInterval(() => {
        if (window.currentUserToken) {
            clearInterval(checkTokenInterval);
            console.log("Authentication token found. Initializing all predictive visualizations.");
            logActivity("PAGE_VIEW", "Viewed Predictive Analytics page."); // Log page view
            initializeAllChartsOnLoad(); // Start loading all charts
        } else {
            console.log("Waiting for authentication token for initial predictive charts load...");
        }
    }, 500); // Check every 500ms
});
