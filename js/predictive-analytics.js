// Assume auth.js sets window.currentUserToken and provides Firebase app/auth instances
// Chart instances to prevent recreation issues
let engagementChartInstance = null;
let reachChartInstance = null;
let salesChartInstance = null;

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
 * Fetches predictive data for a given metric type from the backend.
 * This now calls the combined /api/predictive-analytics endpoint.
 * @param {string} metricType 'sales', 'engagement', or 'reach'.
 * @returns {Promise<object|null>} The data object containing historical data, forecast data, and recommendation, or null on error.
 */
async function fetchPredictiveData(metricType) {
    try {
        const token = window.currentUserToken; 
        console.log(`Fetching predictive data for ${metricType}. Current token:`, token ? "Available" : "NOT available");

        if (!token) {
            showCustomAlert("Authentication token not available. Please log in again.", "Authentication Required");
            console.error("Authentication token is missing.");
            return null;
        }

        const response = await fetch(`http://localhost:5000/api/predictive-analytics?metric_type=${metricType}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            showCustomAlert(errorData.error || `Failed to fetch predictive data for ${metricType}.`, "Error");
            console.error(`Error fetching predictive data for ${metricType}:`, errorData);
            return null;
        }
        const data = await response.json();
        
        console.log(`Frontend received predictive data for ${metricType}:`, data);
        return data;

    } catch (error) {
        showCustomAlert("An unexpected error occurred while fetching predictive data: " + error.message, "Network Error");
        console.error("Network error or unexpected issue:", error);
        return null;
    }
}

/**
 * Renders a Chart.js graph for the given data, including forecast and confidence intervals.
 * @param {HTMLCanvasElement} canvasElement The canvas DOM element.
 * @param {Chart} chartInstance The existing Chart.js instance to destroy/update.
 * @param {Array<object>} historicalData Array of {year, value}.
 * @param {Array<object>} forecastData Array of {year, value, lower_bound, upper_bound}.
 * @param {string} label The label for the data (e.g., 'Sales', 'Engagement').
 * @param {string} chartTitle The title for the chart.
 * @returns {Chart} The new Chart.js instance.
 */
function renderChart(canvasElement, chartInstance, historicalData, forecastData, label, chartTitle) {
    if (!canvasElement) {
        console.error("Canvas element not found for chart:", chartTitle);
        return null;
    }

    if (chartInstance) {
        chartInstance.destroy();
    }

    // Combine labels from historical and forecast data, ensuring unique and sorted years
    const allYears = [...new Set([...historicalData.map(d => d.year), ...forecastData.map(d => d.year)])].sort((a, b) => a - b);
    const labels = allYears.map(String);

    const historicalMap = new Map(historicalData.map(d => [String(d.year), d.value]));
    const forecastMap = new Map(forecastData.map(d => [String(d.year), d.value]));
    const lowerBoundMap = new Map(forecastData.map(d => [String(d.year), d.lower_bound]));
    const upperBoundMap = new Map(forecastData.map(d => [String(d.year), d.upper_bound]));

    const historicalValues = labels.map(year => historicalMap.has(year) ? historicalMap.get(year) : null);
    const forecastValues = labels.map(year => forecastMap.has(year) ? forecastMap.get(year) : null);
    const lowerBounds = labels.map(year => lowerBoundMap.has(year) ? lowerBoundMap.get(year) : null);
    const upperBounds = labels.map(year => upperBoundMap.has(year) ? upperBoundMap.get(year) : null);

    const ctx = canvasElement.getContext('2d');
    const newChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Historical ${label}`,
                    data: historicalValues,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgb(75, 192, 192)'
                },
                {
                    label: `Forecasted ${label}`,
                    data: forecastValues,
                    borderColor: 'rgb(255, 99, 132)', // Red for forecast
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderDash: [5, 5], // Dashed line for forecast
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgb(255, 99, 132)'
                },
                {
                    label: 'Lower Bound',
                    data: lowerBounds,
                    borderColor: 'rgba(0, 0, 0, 0)', // Invisible line
                    backgroundColor: 'rgba(75, 192, 192, 0.1)', // Light fill for CI
                    fill: '-1', // Fill between this and the previous dataset
                    pointRadius: 0,
                    hidden: false // Ensure it's shown for filling
                },
                {
                    label: 'Upper Bound',
                    data: upperBounds,
                    borderColor: 'rgba(0, 0, 0, 0)', // Invisible line
                    backgroundColor: 'rgba(75, 192, 192, 0.1)', // Light fill for CI
                    fill: '1', // Fill between this and the next dataset
                    pointRadius: 0,
                    hidden: false // Ensure it's shown for filling
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    font: {
                        size: 18,
                        weight: 'bold'
                    },
                    color: '#333'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += new Intl.NumberFormat('en-US').format(context.parsed.y);
                            return label;
                        },
                        // Only show specific tooltips for forecast bounds, not the "Lower Bound" / "Upper Bound" itself
                        filter: function (tooltipItem) {
                            return tooltipItem.dataset.label !== 'Lower Bound' && tooltipItem.dataset.label !== 'Upper Bound';
                        }
                    }
                },
                legend: {
                    display: true,
                    labels: {
                        filter: function(item, chart) {
                            // Hide "Lower Bound" and "Upper Bound" from the legend
                            return item.text !== 'Lower Bound' && item.text !== 'Upper Bound';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year',
                        color: '#555'
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: label,
                        color: '#555'
                    },
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('en-US').format(value);
                        }
                    }
                }
            }
        }
    });

    return newChartInstance;
}

/**
 * Displays the selected visualization (chart and recommendation).
 * @param {string} visualizationId 'engagement', 'reach', 'sales'.
 */
async function showVisualization(visualizationId) {
    // Hide all visualization containers first
    document.querySelectorAll('.visualization').forEach(container => {
        container.classList.add('d-none');
    });

    // Display the selected container
    const selectedContainer = document.getElementById(`${visualizationId}-container`);
    if (selectedContainer) {
        selectedContainer.classList.remove('d-none');
    } else {
        console.error("Selected visualization container not found:", visualizationId);
        showCustomAlert("Error: Visualization container not found.", "Display Error");
        return;
    }

    // Fetch and render data for the selected visualization
    // Changed function name to fetchPredictiveData as it now gets forecast
    const data = await fetchPredictiveData(visualizationId); 

    const chartCanvas = document.getElementById(`${visualizationId}Chart`);
    const recommendationElement = document.getElementById(`${visualizationId}Recommendation`);

    if (data && data.historical_data) { // Ensure historical_data exists
        const historicalData = data.historical_data;
        const forecastData = data.forecast_data || []; // Ensure forecastData is an array, even if empty
        const recommendation = data.recommendation;
        const message = data.message; 

        if (historicalData.length === 0 && forecastData.length === 0) {
            if (chartCanvas) {
                const ctx = chartCanvas.getContext('2d');
                ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
                chartCanvas.style.display = 'none';
            }
            if (recommendationElement) {
                recommendationElement.innerHTML = `<em>${message || 'No historical data available to display.'}</em>`;
            }
            return; 
        } else {
             if (chartCanvas) {
                chartCanvas.style.display = 'block';
            }
        }

        let chartLabel = '';
        let chartTitle = '';
        if (visualizationId === 'engagement') {
            chartLabel = 'Combined Engagement'; 
            chartTitle = 'Historical & Forecasted Combined Engagement'; 
            engagementChartInstance = renderChart(chartCanvas, engagementChartInstance, historicalData, forecastData, chartLabel, chartTitle);
        } else if (visualizationId === 'reach') {
            chartLabel = 'Combined Reach'; 
            chartTitle = 'Historical & Forecasted Combined Reach'; 
            reachChartInstance = renderChart(chartCanvas, reachChartInstance, historicalData, forecastData, chartLabel, chartTitle);
        } else if (visualizationId === 'sales') {
            chartLabel = 'Sales Revenue';
            chartTitle = 'Historical & Forecasted Sales Revenue';
            salesChartInstance = renderChart(chartCanvas, salesChartInstance, historicalData, forecastData, chartLabel, chartTitle);
        }

        if (recommendationElement) {
            recommendationElement.textContent = recommendation;
        }
    } else {
        if (chartCanvas) {
            if (visualizationId === 'engagement' && engagementChartInstance) {
                engagementChartInstance.destroy();
                engagementChartInstance = null;
            } else if (visualizationId === 'reach' && reachChartInstance) {
                reachChartInstance.destroy();
                reachChartInstance = null;
            } else if (visualizationId === 'sales' && salesChartInstance) {
                salesChartInstance.destroy();
                salesChartInstance = null;
            }
            chartCanvas.style.display = 'none';
        }
        if (recommendationElement) {
            recommendationElement.textContent = 'Failed to load predictive data or generate recommendation.';
        }
    }
}

function initializePredictiveDisplay() {
    window.addEventListener('tokenAvailable', () => {
        console.log("Authentication token found (from event listener). Displaying default sales visualization.");
        showVisualization('sales'); 
    }, { once: true });
    
    if (window.currentUserToken) {
        console.log("Authentication token already found. Displaying default sales visualization.");
        showVisualization('sales');
    } else {
        console.log("Waiting for tokenAvailable event or token to be set...");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cardEngagement')?.addEventListener('click', () => showVisualization('engagement'));
    document.getElementById('cardReach')?.addEventListener('click', () => showVisualization('reach'));
    document.getElementById('cardSales')?.addEventListener('click', () => showVisualization('sales'));

    initializePredictiveDisplay();
});
