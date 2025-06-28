// Import the logActivity function
import { logActivity } from "/js/auth.js"; 

// Chart instances to prevent recreation issues
let engagementChartInstance = null;
let reachChartInstance = null;

// Global state for KPI Goals, set by the form
window.kpiGoals = {
    reach: 0,
    engagement: 0,
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
 * Utility to convert date string (YYYY-MM-DD or WHICH-MM) to a formatted label.
 * e.g., "2023-11-15" becomes "Nov 15, 2023"
 * e.g., "2023-11" becomes "Nov 2023"
 */
function getFormattedDateLabel(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateParts = dateStr.split('-');

    if (dateParts.length === 3) { // WHICH-MM-DD format (daily/weekly)
        const year = dateParts[0];
        const monthIndex = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[2], 10);
        return `${months[monthIndex]} ${day}, ${year}`;
    } else if (dateParts.length === 2) { // WHICH-MM format (monthly)
        const year = dateParts[0];
        const monthIndex = parseInt(dateParts[1], 10) - 1;
        return `${months[monthIndex]} ${year}`;
    }
    return dateStr; // Return original if format is unexpected
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
    // Add a check to ensure Chart is defined
    if (typeof Chart === 'undefined') {
        console.error("Chart.js library is not loaded. Please ensure chart.umd.js is loaded as a module before this script.");
        return null;
    }

    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas with ID '${chartId}' not found.`);
        return null;
    }

    if (chartInstance) {
        chartInstance.destroy(); // Destroy existing chart instance to prevent memory leaks/overlaps
    }

    // Define common chart options for alignment
    const commonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: {
                left: 40, // Standardize left padding for Y-axis labels
                right: 20,
                top: 20,
                bottom: 20
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
                },
                mode: 'index', // Show tooltip for all datasets at that index
                intersect: false, // Don't require intersection with data point
            },
            legend: {
                display: true,
                position: 'top',
            }
        }
    };


    // Bar chart for Engagement Rate
    if (chartType === 'bar' && chartId === 'engagementChart') { 
        const overallCurrentValue = historicalData.length > 0 ? historicalData[0].value : 0; 
        
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
                ...commonChartOptions, // Spread common options
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: `${label} ${unit}`
                        },
                        max: Math.max(overallCurrentValue, goalValue) * 1.1 // 10% buffer
                    },
                    x: {
                        grid: {
                            display: false // Hide x-axis grid lines for cleaner look
                        }
                    }
                },
                plugins: {
                    ...commonChartOptions.plugins, // Spread common plugins
                    legend: {
                        display: false // Hide dataset legend as labels are sufficient for bar chart
                    }
                }
            }
        });
        return chartInstance;

    } else if (chartType === 'line') { // Line chart for Reach
        const allDates = [...new Set(historicalData.map(d => d.date))].sort((a, b) => new Date(a) - new Date(b));
        const plotData = allDates.map(date => {
            const dataPoint = historicalData.find(d => d.date === date);
            return dataPoint ? parseFloat(dataPoint.value) : null; 
        });

        // Use the new getFormattedDateLabel for dynamic date formatting
        const formattedLabels = allDates.map(date => getFormattedDateLabel(date));

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

        if (goalValue > 0) {
            datasets.push({
                label: `Goal ${label}`,
                data: Array(allDates.length).fill(goalValue), 
                borderColor: 'rgb(255, 99, 132)', 
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderWidth: 2,
                borderDash: [5, 5], 
                pointRadius: 0, 
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
                ...commonChartOptions, // Spread common options
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date' // Changed to a more general "Date"
                        },
                        type: 'category',
                        labels: formattedLabels,
                        ticks: {
                            // Automatically adjust tick display based on the number of labels
                            // This can prevent labels from overlapping on shorter ranges
                            autoSkip: true,
                            maxTicksLimit: 10 // Limit max ticks to avoid overcrowding
                        }
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
                }
                // Plugins are already spread from commonChartOptions
            }
        });
        return chartInstance;
    }
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
    let targetGoalDisplayElement;

    if (metricType === 'engagement') {
        currentMetricElement = document.getElementById('engagementRateCurrent');
        targetGoalDisplayElement = document.getElementById('engagementRateGoal'); 
    } else if (metricType === 'reach') {
        currentMetricElement = document.getElementById('reachCurrent');
        targetGoalDisplayElement = document.getElementById('reachGoalDisplay'); 
    }

    console.log(`--- showVisualization called for ${metricType} ---`);
    console.log(`currentMetricElement (${metricType}Current):`, currentMetricElement);
    console.log(`targetGoalDisplayElement (${metricType}GoalDisplay/Goal):`, targetGoalDisplayElement);
    console.log(`recommendationElement (${metricType}Insight):`, recommendationElement);


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

    let historicalDataForChart = []; 
    let chartLabel = '';
    let chartUnit = '';
    let currentChartInstance = null;
    let chartType = 'line'; 

    let overallEngagementTotal = 0;
    let overallReachForEngagement = 0; 

    // Access performance_charts_data from the API response
    if (allPerformanceData && allPerformanceData.performance_charts_data) {
        allPerformanceData.performance_charts_data.forEach(d => { 
            overallEngagementTotal += (d.engagement_total || 0); 
            overallReachForEngagement += (d.reach_total || 0);   
        });
    }


    if (metricType === 'engagement') {
        const calculatedOverallEngagementRate = (overallReachForEngagement > 0) ? 
                                                (overallEngagementTotal / overallReachForEngagement) * 100 : 
                                                0;
        
        historicalDataForChart = [{ date: 'Overall', value: calculatedOverallEngagementRate }];

        chartLabel = 'Engagement Rate';
        chartUnit = '%';
        currentChartInstance = engagementChartInstance;
        chartType = 'bar'; 
    } else if (metricType === 'reach') {
        // Access performance_charts_data from the API response
        historicalDataForChart = (allPerformanceData && allPerformanceData.performance_charts_data) ? 
                                 allPerformanceData.performance_charts_data.map(d => ({ date: d.date, value: d.reach_total })) : []; 
        chartLabel = 'Reach';
        chartUnit = ''; 
        currentChartInstance = reachChartInstance;
        chartType = 'line'; 
    } 

    const currentValue = (metricType === 'engagement') ? historicalDataForChart[0].value : 
                         (historicalDataForChart.length > 0 ? historicalDataForChart[historicalDataForChart.length - 1].value : 0);
    
    const inputGoalElement = document.getElementById(`${metricType}Goal`);
    const goalValue = inputGoalElement ? parseFloat(inputGoalElement.value) || 0 : 0;
    console.log(`Goal input value from form for ${metricType}:`, inputGoalElement?.value); 
    console.log(`Parsed goalValue for ${metricType}:`, goalValue); 


    if (currentMetricElement) {
        let displayValue = currentValue;
        if (metricType === 'engagement') { 
            displayValue = currentValue.toFixed(2); 
        }
        currentMetricElement.textContent = displayValue.toLocaleString() + chartUnit;
    }
    if (targetGoalDisplayElement) { 
        if (goalValue > 0) {
            let displayGoalValue = goalValue;
            if (metricType === 'engagement') { 
                displayGoalValue = goalValue.toFixed(2); 
            }
            targetGoalDisplayElement.textContent = displayGoalValue.toLocaleString() + chartUnit;
        } else {
            targetGoalDisplayElement.textContent = 'N/A';
        }
        console.log(`Updated goal display for ${metricType} to: ${targetGoalDisplayElement.textContent}`);
    } else {
        console.warn(`Could not find the targetGoalDisplayElement for ${metricType}.`);
    }


    const newChartInstance = renderChart(
        `${metricType}Chart`,
        currentChartInstance,
        historicalDataForChart, 
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
            recommendationElement.textContent = `Your ${chartLabel} is currently at ${currentTextValue}${chartUnit}, short of your goal of ${goalTextValue}${chartUnit}. Consider strategies to boost this metric.`;
        } else {
             recommendationElement.textContent = `Your current ${chartLabel} is ${currentTextValue}${chartUnit}. Set a goal to track progress!`;
        }
        console.log(`Recommendation for ${metricType} set to:`, recommendationElement.textContent);
    } else {
        console.warn(`Recommendation element for ${metricType} not found in the DOM.`);
    }

    showChartLoadingOverlay(metricType, false);
}


document.addEventListener('DOMContentLoaded', () => {
    // Log the page view when the DOM is loaded and the token is available
    window.addEventListener('tokenAvailable', () => {
        logActivity("PAGE_VIEW", "Viewed Performance Evaluation page."); 
        console.log("Token available. Initializing performance evaluation page.");
        // We will NOT call fetchPerformanceData or showVisualization here.
        // It will only be triggered by the form submission.
    }, { once: true });

    // Also, check if the token is already available on direct page load
    if (window.currentUserToken) {
        logActivity("PAGE_VIEW", "Viewed Performance Evaluation page."); 
        console.log("Authentication token already found. Initializing performance evaluation page immediately.");
        // We will NOT call fetchPerformanceData or showVisualization here.
        // It will only be triggered by the form submission.
    } else {
        console.log("Waiting for authentication token for performance evaluation page...");
    }

    const dateRangeSelect = document.getElementById('dateRangeSelect');
    const customDateRangeDiv = document.getElementById('customDateRange');
    const performanceFilterForm = document.getElementById('performanceFilterForm');
    const visualizationContainer = document.getElementById('visualization-container');
    const filterPanel = document.getElementById('filterPanel'); // Get the new filter panel element
    const toggleFilterButton = document.getElementById('toggleFilterButton'); // Get the toggle button
    const closeFilterPanelButton = document.getElementById('closeFilterPanelButton'); // Get the close button


    function setDefaultCustomDates(period) {
        const today = new Date();
        let startDate = new Date();
        const endDate = new Date(today); 

        if (period === '3months') {
            startDate.setMonth(today.getMonth() - 3);
        } else if (period === '6months') {
            startDate.setMonth(today.getMonth() - 6);
        } else if (period === 'lastyear') {
            startDate.setFullYear(today.getFullYear() - 1);
        } else if (period === 'alltime') {
                startDate = new Date(2020, 0, 1); 
        }

        const formatDate = (date) => date.toISOString().split('T')[0];
        document.getElementById('startDate').value = formatDate(startDate);
        document.getElementById('endDate').value = formatDate(endDate);
    }

    setDefaultCustomDates('3months'); // Still set default dates in the form fields

    if (dateRangeSelect.value !== 'custom') {
        customDateRangeDiv.classList.add('d-none');
        customDateRangeDiv.classList.remove('d-flex');
    }

    dateRangeSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customDateRangeDiv.classList.remove('d-none'); 
            customDateRangeDiv.classList.add('d-flex');    
        } else {
            customDateRangeDiv.classList.add('d-none');    
            customDateRangeDiv.classList.remove('d-flex'); 
            setDefaultCustomDates(this.value);              
        }
    });

    performanceFilterForm.addEventListener('submit', async function(event) {
        event.preventDefault(); 

        const selectedDateRange = dateRangeSelect.value;
        let startDate = document.getElementById('startDate').value;
        let endDate = document.getElementById('endDate').value;
        
        window.kpiGoals.reach = parseFloat(document.getElementById('reachGoal').value) || 0;
        window.kpiGoals.engagement = parseFloat(document.getElementById('engagementGoal').value) || 0;
        const platformFilter = document.getElementById('platformFilter').value;

        if (selectedDateRange !== 'custom') {
            const today = new Date();
            endDate = today.toISOString().split('T')[0]; 

            let calculatedStartDate = new Date();
            if (selectedDateRange === '3months') {
                calculatedStartDate.setMonth(today.getMonth() - 3);
            } else if (selectedDateRange === '6months') {
                calculatedStartDate.setMonth(today.getMonth() - 6);
            } else if (selectedDateRange === 'lastyear') {
                calculatedStartDate.setFullYear(today.getFullYear() - 1);
            } else if (selectedDateRange === 'alltime') {
                calculatedStartDate = new Date(2020, 0, 1); 
            }
            startDate = calculatedStartDate.toISOString().split('T')[0];
        }

        console.log('Filters Applied:', {
            selectedDateRange,
            startDate,
            endDate,
            reachGoal: window.kpiGoals.reach,
            engagementGoal: window.kpiGoals.engagement,
            platformFilter
        });

        // Ensure visualization container is visible when filters are applied
        visualizationContainer.style.display = 'flex'; 

        const allPerformanceData = await fetchPerformanceData(startDate, endDate, platformFilter);

        if (allPerformanceData) {
            Promise.all([
                // Pass allPerformanceData directly to showVisualization
                showVisualization('engagement', allPerformanceData), 
                showVisualization('reach', allPerformanceData),
            ]).then(() => {
                console.log("All performance charts displayed.");
                // Hide the filter panel after applying filters
                filterPanel.classList.remove('filter-panel-open');
                logActivity("PERFORMANCE_FILTER_APPLIED", `Applied filters: ${selectedDateRange}, Platform: ${platformFilter}`); // Log filter application
            }).catch(error => {
                console.error("Error displaying charts:", error);
                showCustomAlert("An error occurred while displaying charts.", "Chart Error");
                // If there's an error, hide visualizations 
                visualizationContainer.style.display = 'none';
                logActivity("PERFORMANCE_CHART_ERROR", `Error displaying charts: ${error.message}`); // Log chart display error
            });
        } else {
            showCustomAlert("Could not retrieve performance data. Please check your connection or data.", "Data Error");
            // If no data, hide visualizations
            visualizationContainer.style.display = 'none'; 
            logActivity("PERFORMANCE_DATA_ERROR", `Could not retrieve performance data: No data or connection error.`); // Log data retrieval error
        }
    });

    // Ensure visualization container is hidden on page load
    visualizationContainer.style.display = 'none';

    // Automatically open the filter panel on page load
    filterPanel.classList.add('filter-panel-open');

    // Toggle filter panel visibility
    toggleFilterButton.addEventListener('click', () => {
        filterPanel.classList.toggle('filter-panel-open');
    });

    // Close filter panel using the 'X' button
    closeFilterPanelButton.addEventListener('click', () => {
        filterPanel.classList.remove('filter-panel-open');
    });
});
