// Assume auth.js handles Firebase initialization and auth state
// window.currentUserTokenPromise is expected to be set by auth.js

let correlationData = {}; // Global variable to store fetched correlation results
let charts = {}; // Object to store Chart.js instances

/**
 * Fetches correlation data from the backend API for a given date range.
 * @param {string} startDate - The start date in YYYY-MM-DD format (optional).
 * @param {string} endDate - The end date in YYYY-MM-DD format (optional).
 */
async function fetchCorrelationData(startDate = null, endDate = null) {
    let url = "http://localhost:5000/api/correlation-analysis";
    const params = new URLSearchParams();
    if (startDate) {
        params.append('start_date', startDate);
    }
    if (endDate) {
        params.append('end_date', endDate);
    }
    if (params.toString()) {
        url += `?${params.toString()}`;
    }

    try {
        const token = await window.currentUserTokenPromise; 
        if (!token) {
            console.error("Authentication token not available. Please log in.");
            displayMessage("Authentication required. Please log in.", "error");
            return;
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to fetch correlation data");
        }
        
        const data = await response.json();
        correlationData = data; // Store the fetched data globally
        
        // Hide all visualizations initially after fetching new data
        document.querySelectorAll('.visualization').forEach(viz => {
            viz.classList.add('d-none');
        });

        renderCorrelationResults(); // Render the results after fetching
        console.log("Correlation analysis data:", data);
        displayMessage(data.message || "Correlation data loaded successfully.", "success");

    } catch (error) {
        console.error("Error loading correlation data:", error.message);
        displayMessage("Error loading correlation data: " + error.message, "error");
        
        // Populate with default/error states if fetching fails
        correlationData = {
            correlations: {
                engage_reach: null,
                engage_sales: null,
                reach_sales: null,
            },
            recommendations: {
                engage_reach: "Error: Could not load recommendation.",
                engage_sales: "Error: Could not load recommendation.",
                reach_sales: "Error: Could not load recommendation.",
            },
            chart_data: [], // Ensure chart_data is an empty array on error
            message: "Failed to load correlation data."
        };
        renderCorrelationResults(); // Attempt to render with error state
    }
}

/**
 * Renders the fetched correlation results onto the UI elements.
 * This now involves rendering scatter charts.
 */
function renderCorrelationResults() {
    if (!correlationData || !correlationData.correlations || !correlationData.chart_data) {
        console.error("No correlation data or chart_data available to render.");
        return;
    }

    const correlations = correlationData.correlations;
    const recommendations = correlationData.recommendations;
    const chartData = correlationData.chart_data;

    // Engagement / Reach Chart
    const er_data = chartData.map(d => ({ x: d.engagement, y: d.reach }));
    const er_corr = correlations.engage_reach;
    const er_rec = recommendations.engage_reach;
    renderScatterChart('engageReachChart', 'Engagement', 'Reach', er_data, er_corr);
    updateRecommendationText('engageReachRecommendation', er_rec);

    // Engagement / Sales Chart
    const es_data = chartData.map(d => ({ x: d.engagement, y: d.sales }));
    const es_corr = correlations.engage_sales;
    const es_rec = recommendations.engage_sales;
    renderScatterChart('engageSalesChart', 'Engagement', 'Sales', es_data, es_corr);
    updateRecommendationText('engageSalesRecommendation', es_rec);

    // Reach / Sales Chart
    const rs_data = chartData.map(d => ({ x: d.reach, y: d.sales }));
    const rs_corr = correlations.reach_sales;
    const rs_rec = recommendations.reach_sales;
    renderScatterChart('reachSalesChart', 'Reach', 'Sales', rs_data, rs_corr);
    updateRecommendationText('reachSalesRecommendation', rs_rec);
}

/**
 * Renders a scatter chart with a linear regression line.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {string} xLabel - Label for the X-axis.
 * @param {string} yLabel - Label for the Y-axis.
 * @param {Array<Object>} data - Array of objects {x: value, y: value}.
 * @param {number|null} correlationValue - The calculated correlation value (for display in tooltip).
 */
function renderScatterChart(canvasId, xLabel, yLabel, data, correlationValue) {
    const ctx = document.getElementById(canvasId);

    // Destroy existing chart instance if it exists
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    // Calculate linear regression for the trend line
    let linearRegressionData = [];
    if (data && data.length > 1) { // Need at least two points for a line
        const xs = data.map(point => point.x);
        const ys = data.map(point => point.y);

        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += xs[i];
            sumY += ys[i];
            sumXY += xs[i] * ys[i];
            sumXX += xs[i] * xs[i];
        }

        const denominator = (n * sumXX - sumX * sumX);
        if (denominator === 0) { // Handle vertical line or all x-values are the same
            linearRegressionData = []; // Cannot draw a unique line
        } else {
            const slope = (n * sumXY - sumX * sumY) / denominator;
            const intercept = (sumY - slope * sumX) / n;

            // Generate points for the regression line based on min/max X values
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);

            if (isFinite(minX) && isFinite(maxX) && isFinite(slope) && isFinite(intercept)) {
                linearRegressionData.push({ x: minX, y: slope * minX + intercept });
                linearRegressionData.push({ x: maxX, y: slope * maxX + intercept });
            }
        }
    }

    // Determine colors based on correlation strength/direction
    let pointColor = '#5b54f2'; // Default blue for points
    let trendLineColor = '#7B68EE'; // Default purple for trend line
    
    if (correlationValue !== null) {
        if (correlationValue > 0.3) {
            trendLineColor = '#28a745'; // Green for positive correlation
        } else if (correlationValue < -0.3) {
            trendLineColor = '#dc3545'; // Red for negative correlation
        } else {
            trendLineColor = '#6c757d'; // Gray for weak/negligible
        }
        // Points can also reflect this
        pointColor = trendLineColor;
    }


    charts[canvasId] = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Data Points',
                data: data,
                backgroundColor: pointColor,
                borderColor: pointColor,
                borderWidth: 1,
                pointRadius: 5,
                pointHoverRadius: 7
            },
            {
                label: 'Trend Line',
                data: linearRegressionData,
                type: 'line', // This dataset will be rendered as a line
                borderColor: trendLineColor,
                backgroundColor: trendLineColor,
                borderWidth: 2,
                fill: false,
                pointRadius: 0, // No points for the trend line
                tension: 0.1 // Straight line
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow canvas to resize freely
            plugins: {
                title: {
                    display: true,
                    text: `Correlation: ${correlationValue !== null ? correlationValue.toFixed(2) : 'N/A'}`,
                    font: { size: 16, weight: 'bold' },
                    color: '#333'
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `(${xLabel}: ${context.parsed.x}, ${yLabel}: ${context.parsed.y})`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        // You can add annotations here, e.g., to indicate correlation strength zones
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: xLabel,
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        // Improve tick formatting if values are very large
                        callback: function(value) {
                            return value.toLocaleString(); // Add commas for large numbers
                        }
                    }
                },
                y: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: yLabel,
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString(); // Add commas for large numbers
                        }
                    }
                }
            }
        }
    });
}

/**
 * Updates the recommendation text in the UI.
 * @param {string} divId - The ID of the div to update.
 * @param {string} text - The recommendation text.
 */
function updateRecommendationText(divId, text) {
    const recommendationDiv = document.getElementById(divId);
    if (recommendationDiv) {
        recommendationDiv.textContent = text;
    }
}


/**
 * Hides all correlation visualizations and shows only the selected one.
 * @param {string} vizId - The ID of the visualization div to show.
 */
function showVisualization(vizId) {
    console.log(`Attempting to show visualization: ${vizId}`); // Debug log

    // Hide all visualizations
    document.querySelectorAll('.visualization').forEach(viz => {
        viz.classList.add('d-none');
    });

    // Show the selected visualization
    const selectedViz = document.getElementById(vizId);
    if (selectedViz) {
        selectedViz.classList.remove('d-none');
    }
}

// Make showVisualization and applyDateFilter globally accessible
// so they can be called from onclick attributes in HTML.
window.showVisualization = showVisualization;

/**
 * Applies the selected date range filter and re-fetches correlation data.
 */
function applyDateFilter() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    fetchCorrelationData(startDate, endDate);
}
window.applyDateFilter = applyDateFilter; // Make globally accessible


/**
 * Displays a message to the user (e.g., success or error).
 * @param {string} message - The message text.
 * @param {string} type - 'success' or 'error'.
 */
function displayMessage(message, type) {
    // Implement a custom modal or message box here instead of alert
    console.log(`Message (${type}): ${message}`);
    // Example: For a real app, consider using a Bootstrap Toast or a custom modal
    // const messageContainer = document.getElementById('messageContainer'); // A div for messages
    // if (!messageContainer) {
    //     const body = document.querySelector('body');
    //     messageContainer = document.createElement('div');
    //     messageContainer.id = 'messageContainer';
    //     messageContainer.style = 'position: fixed; top: 20px; right: 20px; z-index: 1050;';
    //     body.appendChild(messageContainer);
    // }
    // const alertDiv = document.createElement('div');
    // alertDiv.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`;
    // alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    // messageContainer.appendChild(alertDiv);
    // setTimeout(() => {
    //     if(alertDiv) alertDiv.remove();
    // }, 5000); 
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Set default dates for the filter to the last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    document.getElementById('endDate').value = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = thirtyDaysAgo.toISOString().split('T')[0];

    if (window.currentUserTokenPromise) {
        fetchCorrelationData(document.getElementById('startDate').value, document.getElementById('endDate').value);
    } else {
        console.error("window.currentUserTokenPromise is not defined. Ensure auth.js is loaded correctly and initializes this promise.");
        displayMessage("Application error: Authentication service not ready.", "error");
    }
});
