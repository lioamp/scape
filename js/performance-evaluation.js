// performance-evaluation.js

// Chart instances to prevent recreation issues
let engagementChartInstance = null;
let reachChartInstance = null;
// conversionChartInstance removed

// Global state for KPI Goals, set by the form
window.kpiGoals = {
    reach: 0,
    engagement: 0,
    // conversion removed
};

// Helper function to show a custom alert modal
function showCustomAlert(message, title = 'Notification') {
    const modalElement = document.getElementById('customAlertModal');
    const modalTitle = document.getElementById('customAlertModalLabel');
    const modalBody = document.getElementById('customAlertModalBody');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    // Ensure the modal element exists before trying to create a Bootstrap modal instance
    if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    } else {
        console.error("Custom alert modal element not found in the DOM.");
        // Fallback to native alert if modal element is missing, though this should be avoided.
        alert(`${title}: ${message}`); 
    }
}

// Helper function to show or hide loading overlay for charts
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
 */
function getMonthYearAbbreviation(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(dateStr);
    // Use getUTCMonth and getUTCFullYear to avoid timezone issues affecting the year for "YYYY-01-01" dates
    return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// Cache for performance data to avoid re-fetching on every click if filters are the same
const performanceDataCache = {};
const CACHE_EXPIRATION_MS = 5 * 60 * 1000; // Cache data for 5 minutes

/**
 * Fetches historical performance data for the selected metrics, date range, and platform.
 * This is now specifically for the "Performance Evaluation" tab, not predictive analytics.
 * @param {string} startDate The start date for the data range (YYYY-MM-DD).
 * @param {string} endDate The end date for the data range (YYYY-MM-DD).
 * @param {string} platform The selected platform ('all', 'facebook', 'tiktok').
 * @returns {Promise<object|null>} The data object containing historical data for all metrics, or null on error.
 */
async function fetchPerformanceData(startDate, endDate, platform) {
    const cacheKey = `${startDate}-${endDate}-${platform}`;

    if (performanceDataCache[cacheKey] && (Date.now() - performanceDataCache[cacheKey].timestamp < CACHE_EXPIRATION_MS)) {
        console.log(`Using cached performance data for ${cacheKey}.`);
        return performanceDataCache[cacheKey].data;
    }

    try {
        const token = window.currentUserToken;
        console.log(`Fetching performance data. Current token:`, token ? "Available" : "NOT available");

        if (!token) {
            showCustomAlert("Authentication token not available. Please log in.", "Authentication Required");
            return null;
        }

        const API_BASE_URL = "http://127.0.0.1:5000/api";
        const queryParams = new URLSearchParams({
            start_date: startDate,
            end_date: endDate,
            platform: platform
        }).toString();

        // Use the new performance-data endpoint
        const response = await fetch(`${API_BASE_URL}/performance-data?${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Performance data fetched:`, data);

        // Store fetched data in cache
        performanceDataCache[cacheKey] = {
            data: data,
            timestamp: Date.now()
        };

        return data;

    } catch (error) {
        console.error('Error fetching performance data:', error);
        showCustomAlert(`Error loading performance data: ${error.message}`, "Data Load Error");
        return null;
    }
}


/**
 * Renders the Chart.js chart for a given metric.
 * @param {string} chartId The ID of the canvas element.
 * @param {object} chartInstance The existing chart instance (can be null).
 * @param {Array<object>} historicalData Array of {date, value} for historical data.
 * @param {string} label The label for the chart (e.g., "Combined Engagement").
 * @param {string} unit The unit for the Y-axis (e.g., "", "$").
 * @param {string} chartType The type of chart to render ('line', 'bar').
 * @param {number} goalValue The goal value for the metric.
 * @returns {object} The new or updated chart instance.
 */
function renderChart(chartId, chartInstance, historicalData, label, unit = '', chartType = 'line', goalValue = 0) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas with ID '${chartId}' not found.`);
        return null;
    }

    if (chartInstance) {
        chartInstance.destroy(); // Destroy existing chart instance to prevent memory leaks/overlaps
    }

    // Bar chart for Engagement Rate
    if (chartType === 'bar' && chartId === 'engagementChart') { 
        // For the bar chart, historicalData will now represent the _overall_ aggregated data for the period
        // The current value will be derived from the passed 'historicalData' which contains the overall aggregated value.
        const overallCurrentValue = historicalData.length > 0 ? historicalData[0].value : 0; // Assuming historicalData[0] holds the single aggregated value

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [`Current ${label}`, `Goal ${label}`],
                datasets: [
                    {
                        label: 'Value',
                        data: [overallCurrentValue, goalValue],
                        backgroundColor: ['#5A4CD1', '#FF6384'], // Purple for current, Red for goal
                        borderColor: ['#5A4CD1', '#FF6384'],
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: `${label} ${unit}`
                        },
                        // Ensure max value is at least the goal or current for better comparison
                        max: Math.max(overallCurrentValue, goalValue) * 1.1 // 10% buffer
                    },
                    x: {
                        grid: {
                            display: false // Hide x-axis grid lines for cleaner look
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false // Hide dataset legend as labels are sufficient
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString() + unit;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        return chartInstance;

    } else if (chartType === 'line') { // Line chart for Reach
        const allDates = [...new Set(historicalData.map(d => d.date))].sort((a, b) => new Date(a) - new Date(b));

        // Ensure plotData contains actual numbers for Chart.js
        const plotData = allDates.map(date => {
            const dataPoint = historicalData.find(d => d.date === date);
            return dataPoint ? parseFloat(dataPoint.value) : null; // Ensure value is a number
        });

        const formattedLabels = allDates.map(date => getMonthYearAbbreviation(date));

        const datasets = [
            {
                label: `Historical ${label}`,
                data: plotData,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                pointRadius: 3,
                fill: false,
                tension: 0.4
            }
        ];

        // Add Goal Line if goalValue is set and not zero
        if (goalValue > 0) {
            datasets.push({
                label: `Goal ${label}`,
                data: Array(allDates.length).fill(goalValue), // A flat line at the goal value
                borderColor: 'rgb(255, 99, 132)', // Red for goal line
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderWidth: 2,
                borderDash: [5, 5], // Dashed line for goal
                pointRadius: 0, // No points on goal line
                fill: false,
                tension: 0
            });
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: formattedLabels,
                datasets: datasets
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
                                    label += context.parsed.y.toLocaleString() + unit; 
                                }
                                return label;
                            }
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                    }
                }
            }
        });
        return chartInstance;
    }
    // Fallback if chartType is unknown or not explicitly handled 
    console.error(`Unhandled chart type: ${chartType} for chart ID: ${chartId}`);
    return null;
}


/**
 * Handles the display and rendering of a single visualization chart.
 * Manages its own loading overlay and ensures the canvas is visible only when loaded.
 * @param {string} metricType The type of metric to display ('engagement', 'reach').
 * @param {object} allPerformanceData The complete aggregated historical data for all metrics.
 */
async function showVisualization(metricType, allPerformanceData) {
    const recommendationElement = document.getElementById(`${metricType}Insight`);
    const chartCanvas = document.getElementById(`${metricType}Chart`);
    const chartContainer = document.getElementById(`${metricType}-chart-container`);
    
    let currentMetricElement; 
    let goalMetricElement;

    // Determine the correct IDs for the current and goal display elements
    if (metricType === 'engagement') {
        currentMetricElement = document.getElementById('engagementRateCurrent');
        goalMetricElement = document.getElementById('engagementRateGoal');
    } else if (metricType === 'reach') {
        currentMetricElement = document.getElementById('reachCurrent');
        goalMetricElement = document.getElementById('reachGoal');
    }


    // Show loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = `${metricType}LoadingOverlay`;
    loadingOverlay.className = 'chart-loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="spinner"></div>
        <p class="text-primary mt-3">Loading ${metricType} data...</p>
    `;
    if (chartContainer && !document.getElementById(`${metricType}LoadingOverlay`)) {
        chartContainer.style.position = 'relative';
        chartContainer.appendChild(loadingOverlay);
    }
    showChartLoadingOverlay(metricType, true);

    let historicalDataForMetric = [];
    let chartLabel = '';
    let chartUnit = '';
    let currentChartInstance = null;
    let chartType = 'line'; // Default to line chart

    let overallEngagementTotal = 0;
    let overallReachForEngagement = 0; // Separate total reach for engagement rate calculation

    if (metricType === 'engagement') {
        // Accumulate totals for the entire filtered period for Engagement Rate
        allPerformanceData.forEach(d => {
            overallEngagementTotal += (d.engagement_total || 0);
            overallReachForEngagement += (d.reach_total || 0);
        });

        // Calculate overall engagement rate for the displayed period
        const calculatedOverallEngagementRate = (overallReachForEngagement > 0) ? 
                                                (overallEngagementTotal / overallReachForEngagement) * 100 : 
                                                0;
        
        // Pass a single data point representing the overall calculated rate for the bar chart
        historicalDataForMetric = [{ date: 'Overall', value: calculatedOverallEngagementRate }];

        chartLabel = 'Engagement Rate';
        chartUnit = '%';
        currentChartInstance = engagementChartInstance;
        chartType = 'bar'; 
    } else if (metricType === 'reach') {
        historicalDataForMetric = allPerformanceData.map(d => ({ date: d.date, value: d.reach_total })); 
        chartLabel = 'Reach';
        chartUnit = ''; 
        currentChartInstance = reachChartInstance;
        chartType = 'line'; // Explicitly set to line for reach
    } 

    // Get the current value for display in the summary box
    // For engagement, this is now `historicalDataForMetric[0].value` (the overall calculated rate)
    // For reach, it's the last value in the time series
    const currentValue = (metricType === 'engagement') ? historicalDataForMetric[0].value : 
                         (historicalDataForMetric.length > 0 ? historicalDataForMetric[historicalDataForMetric.length - 1].value : 0);
    
    const goalValue = window.kpiGoals[metricType]; 

    // Update Current/Goal KPI displays
    if (currentMetricElement) {
        let displayValue = currentValue;
        if (metricType === 'engagement') { 
            displayValue = currentValue.toFixed(2); 
        }
        currentMetricElement.textContent = displayValue.toLocaleString() + chartUnit;
    }
    if (goalMetricElement) {
        if (goalValue > 0) {
            let displayGoalValue = goalValue;
            if (metricType === 'engagement') { 
                displayGoalValue = goalValue.toFixed(2); 
            }
            goalMetricElement.textContent = displayGoalValue.toLocaleString() + chartUnit;
        } else {
            goalMetricElement.textContent = 'N/A';
        }
    }


    const newChartInstance = renderChart(
        `${metricType}Chart`,
        currentChartInstance,
        historicalDataForMetric, 
        chartLabel,
        chartUnit,
        chartType,
        goalValue 
    );

    if (metricType === 'engagement') {
        engagementChartInstance = newChartInstance;
    } else if (metricType === 'reach') {
        reachChartInstance = newChartInstance;
    } 

    // Placeholder recommendation logic - replace with actual recommendations from backend if available
    if (recommendationElement) {
        let currentTextValue = currentValue.toLocaleString();
        let goalTextValue = goalValue > 0 ? goalValue.toLocaleString() : 'N/A';

        if (metricType === 'engagement') {
            currentTextValue = currentValue.toFixed(2);
            if (goalValue > 0) {
                goalTextValue = goalValue.toFixed(2);
            }
        }

        if (currentValue >= goalValue && goalValue > 0) {
            recommendationElement.textContent = `Great job! Your ${chartLabel} is currently meeting or exceeding your goal of ${goalTextValue}${chartUnit}. Keep up the excellent work!`;
        } else if (goalValue > 0) {
            const needed = goalValue - currentValue;
            let neededText = needed.toLocaleString();
            if (metricType === 'engagement') {
                neededText = needed.toFixed(2);
            }
            recommendationElement.textContent = `Your ${chartLabel} is currently at ${currentTextValue}${chartUnit}, short of your goal of ${goalTextValue}${chartUnit} by ${neededText}${chartUnit}. Consider strategies to boost this metric.`;
        } else {
             recommendationElement.textContent = `Your current ${currentTextValue}${chartUnit}. Set a goal to track progress!`;
        }
    }

    // Hide overlay and show canvas
    showChartLoadingOverlay(metricType, false);
}


document.addEventListener('DOMContentLoaded', () => {
    const dateRangeSelect = document.getElementById('dateRangeSelect');
    const customDateRangeDiv = document.getElementById('customDateRange');
    const performanceFilterForm = document.getElementById('performanceFilterForm');
    const visualizationContainer = document.getElementById('visualization-container');

    // Function to set default dates for custom range based on selected period
    function setDefaultCustomDates(period) {
        const today = new Date();
        let startDate = new Date();
        const endDate = new Date(today); // End date is always today or closest past date for full period

        if (period === '3months') {
            startDate.setMonth(today.getMonth() - 3);
        } else if (period === '6months') {
            startDate.setMonth(today.getMonth() - 6);
        } else if (period === 'lastyear') {
            startDate.setFullYear(today.getFullYear() - 1);
        } else if (period === 'alltime') {
                startDate = new Date(2020, 0, 1); // Example: Jan 1, 2020
        }

        // Format dates to replete-MM-DD for input fields
        const formatDate = (date) => date.toISOString().split('T')[0];
        document.getElementById('startDate').value = formatDate(startDate);
        document.getElementById('endDate').value = formatDate(endDate);
    }

    // Initialize custom date range inputs with default "Last 3 Months" dates
    setDefaultCustomDates('3months');

    // Explicitly hide customDateRangeDiv on page load if the default selected option is not 'custom'.
    if (dateRangeSelect.value !== 'custom') {
        customDateRangeDiv.classList.add('d-none');
        customDateRangeDiv.classList.remove('d-flex');
    }

    // Handle visibility of custom date range inputs based on select value
    dateRangeSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customDateRangeDiv.classList.remove('d-none'); // Show custom date inputs
            customDateRangeDiv.classList.add('d-flex');    // Ensure it lays out as flex
        } else {
            customDateRangeDiv.classList.add('d-none');    // Hide custom date inputs
            customDateRangeDiv.classList.remove('d-flex'); // Remove flex when hidden
            setDefaultCustomDates(this.value);              // Set dates based on predefined range
        }
    });

    // Handle form submission
    performanceFilterForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // Prevent default form submission

        // Get selected filter values
        const selectedDateRange = dateRangeSelect.value;
        let startDate = document.getElementById('startDate').value;
        let endDate = document.getElementById('endDate').value;
        
        // Parse goal values and store them globally
        window.kpiGoals.reach = parseFloat(document.getElementById('reachGoal').value) || 0;
        window.kpiGoals.engagement = parseFloat(document.getElementById('engagementGoal').value) || 0;
        // window.kpiGoals.conversion removed
        const platformFilter = document.getElementById('platformFilter').value;

        // If custom range is not selected, update start/end dates based on preset
        if (selectedDateRange !== 'custom') {
            const today = new Date();
            endDate = today.toISOString().split('T')[0]; // Current date

            let calculatedStartDate = new Date();
            if (selectedDateRange === '3months') {
                calculatedStartDate.setMonth(today.getMonth() - 3);
            } else if (selectedDateRange === '6months') {
                calculatedStartDate.setMonth(today.getMonth() - 6);
            } else if (selectedDateRange === 'lastyear') {
                calculatedStartDate.setFullYear(today.getFullYear() - 1);
            } else if (selectedDateRange === 'alltime') {
                calculatedStartDate = new Date(2020, 0, 1); // Arbitrary old date for "All-Time"
            }
            startDate = calculatedStartDate.toISOString().split('T')[0];
        }

        console.log('Filters Applied:', {
            selectedDateRange,
            startDate,
            endDate,
            reachGoal: window.kpiGoals.reach,
            engagementGoal: window.kpiGoals.engagement,
            // conversionGoal removed
            platformFilter
        });

        // Show the visualization container
        visualizationContainer.style.display = 'flex'; // Use flex for column layout

        // Fetch all performance data once
        const allPerformanceData = await fetchPerformanceData(startDate, endDate, platformFilter);

        if (allPerformanceData) {
            // Initialize and display charts based on filters and fetched data
            // Pass the entire data object to showVisualization
            Promise.all([
                showVisualization('engagement', allPerformanceData),
                showVisualization('reach', allPerformanceData),
                // showVisualization('conversion', allPerformanceData) removed
            ]).then(() => {
                console.log("All performance charts displayed.");
            }).catch(error => {
                console.error("Error displaying charts:", error);
                showCustomAlert("An error occurred while displaying charts.", "Chart Error");
            });
        } else {
            // Handle case where allPerformanceData fetching failed
            showCustomAlert("Could not retrieve performance data. Please check your connection or data.", "Data Error");
            visualizationContainer.style.display = 'none'; // Hide charts if no data
        }
    });

    // Initially hide the charts until filters are applied
    visualizationContainer.style.display = 'none';
});
