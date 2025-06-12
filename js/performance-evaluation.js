// performance-evaluation.js

// Assuming auth.js sets window.currentUserToken and provides Firebase app/auth instances
// and that auth.js exports `getAuth` to get the auth instance.
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';

// Re-using your Firebase config from auth.js if it's not globally available
const firebaseConfig = {
    apiKey: "AIzaSyCyIr7hWhROGodkcsMJC9n4sEuDOR5NGww",
    authDomain: "scape-login.firebaseapp.com",
    projectId: "scape-login",
    storageBucket: "scape-login.firebasestorage.app",
    messagingSenderId: "410040228789",
    appId: "1:410040228789:web:5b9b4b32e91c5549ab17fc",
    measurementId: "G-GBNRL156FJ",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// Backend API Base URL
const API_BASE_URL = "http://localhost:5000/api";

// Mock Data for KPI Targets, Insights, and Recommendations (Current values will be dynamic)
const kpiMeta = {
    engagement: {
        goal: 5, // As a percentage
        insight: "Engagement rate is meeting the goal. Continue to monitor content performance for sustained audience interaction.",
        recommendation: "Current marketing strategy is effective for engagement; continue optimizing content for audience interaction and consider A/B testing new formats."
    },
    reach: {
        goal: 8000,
        insight: "Reach is currently below the set goal. Efforts to expand audience exposure are needed.",
        recommendation: "To increase reach, explore new advertising channels, target broader demographics, and leverage influencer collaborations."
    },
    conversion: {
        goal: 4, // As a percentage
        current: 3.2, // Still mock for now, as no direct time-series API for this
        insight: "Conversion rate is slightly below target. Reviewing the sales funnel is recommended.",
        recommendation: "Improve landing page UX, streamline the checkout process, and offer clear calls-to-action to boost conversion rate."
    }
};

// Global storage for processed data and chart instances
let processedChartData = {
    engagement: { daily: { labels: [], values: [] }, monthly: { labels: [], values: [] } },
    reach: { daily: { labels: [], values: [] }, monthly: { labels: [], values: [] } },
    conversion: { labels: ['Goal', 'Current'], values: [kpiMeta.conversion.goal, kpiMeta.conversion.current] }
};
const chartInstances = {};

// Threshold for daily vs. monthly aggregation (in days)
const AGGREGATION_THRESHOLD_DAYS = 90; // If date range is 90 days or less, show daily data

// Current filter states
let currentPlatformFilter = 'all'; // Default to 'all' platforms
let currentStartDate = null;
let currentEndDate = null;


// --- Utility Functions ---

/**
 * Sets the welcome message on the page.
 * @param {string} userName - The name of the logged-in user.
 */
function setWelcomeMessage(userName) {
    const welcomeEl = document.getElementById("welcome-message");
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome, ${userName}! Performance Evaluation`;
    }
}

/**
 * Generates an array of dates between a start and end date (inclusive).
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<string>} Array of date strings in YYYY-MM-DD format.
 */
function getDatesInRange(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split('T')[0]); // YYYY-MM-DD
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

/**
 * Aggregates raw social media data based on specified granularity (daily or monthly).
 * @param {Array<Object>} data - Array of data objects (e.g., from TikTok or Facebook API).
 * @param {string} granularity - 'daily' or 'monthly'.
 * @param {string} [rangeStartDateStr=null] - Optional start date string for daily range filling.
 * @param {string} [rangeEndDateStr=null] - Optional end date string for daily range filling.
 * @returns {Object} - Object with aggregated data ({ labels: [], reach: [], engagement: [] }).
 */
function aggregateData(data, granularity, rangeStartDateStr = null, rangeEndDateStr = null) {
    const aggregates = {};

    data.forEach(item => {
        const dateStr = item.date;
        if (!dateStr) return;

        let key;
        if (granularity === 'daily') {
            key = dateStr; // Use YYYY-MM-DD as key for daily
        } else {
            const date = new Date(dateStr);
            key = date.toLocaleString('en-US', { month: 'short', year: 'numeric' }); // Use "Mon YYYY" for monthly
        }

        if (!aggregates[key]) {
            aggregates[key] = {
                reach: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                engagement: 0
            };
        }

        aggregates[key].reach += item.views || item.reach || 0;
        aggregates[key].likes += item.likes || 0;
        aggregates[key].comments += item.comments || 0;
        aggregates[key].shares += item.shares || 0;
    });

    for (const key in aggregates) {
        const { likes, comments, shares } = aggregates[key];
        aggregates[key].engagement = (likes + comments + shares);
    }

    let labels;
    let sortedKeys = Object.keys(aggregates);

    if (granularity === 'daily') {
        // Fill in missing dates for daily view
        if (rangeStartDateStr && rangeEndDateStr) {
            const allDates = getDatesInRange(new Date(rangeStartDateStr), new Date(rangeEndDateStr));
            labels = allDates;
            allDates.forEach(date => {
                if (!aggregates[date]) {
                    aggregates[date] = { reach: 0, engagement: 0 };
                }
            });
        } else {
            // If no range provided (e.g., fetching all data on initial load), sort existing daily keys
            labels = sortedKeys.sort();
        }
    } else { // 'monthly'
        labels = sortedKeys.sort((a, b) => {
            const dateA = new Date(a.replace(/(\w{3})\s(\d{4})/, '1 $1 $2'));
            const dateB = new Date(b.replace(/(\w{3})\s(\d{4})/, '1 $1 $2'));
            return dateA - dateB;
        });
    }

    const reachValues = labels.map(key => aggregates[key]?.reach || 0);
    const engagementValues = labels.map(key => aggregates[key]?.engagement || 0);

    return { labels, reach: reachValues, engagement: engagementValues };
}


/**
 * Fetches data from a given API endpoint.
 * @param {string} endpoint - The API endpoint (e.g., '/tiktokdata').
 * @param {string} token - The authentication token.
 * @param {string} startDate - Optional start date (YYYY-MM-DD).
 * @param {string} endDate - Optional end date (YYYY-MM-DD).
 * @returns {Promise<Array<Object>>} - A promise that resolves with the fetched data.
 */
async function fetchData(endpoint, token, startDate = null, endDate = null) {
    let url = `${API_BASE_URL}${endpoint}`;
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
        const response = await fetch(url, {
            headers: { Authorization: token }
        });
        if (!response.ok) {
            const error = await response.json();
            console.error(`Error fetching data from ${endpoint}:`, error.error || response.statusText);
            return [];
        }
        return response.json();
    } catch (error) {
        console.error(`Network error fetching data from ${endpoint}:`, error);
        return [];
    }
}

/**
 * Initializes the KPI cards with current and goal values, and populates recommendation text.
 * Uses the latest calculated values for "Current".
 */
function initializeKPICards() {
    // Determine which granularity to use for "current" values on cards
    // If a specific range is selected and within daily threshold, use daily, otherwise monthly for current values
    const engagementData = (currentStartDate && currentEndDate && (Math.ceil(Math.abs(new Date(currentEndDate) - new Date(currentStartDate)) / (1000 * 60 * 60 * 24)) <= AGGREGATION_THRESHOLD_DAYS)) ? processedChartData.engagement.daily : processedChartData.engagement.monthly;
    const reachData = (currentStartDate && currentEndDate && (Math.ceil(Math.abs(new Date(currentEndDate) - new Date(currentStartDate)) / (1000 * 60 * 60 * 24)) <= AGGREGATION_THRESHOLD_DAYS)) ? processedChartData.reach.daily : processedChartData.reach.monthly;


    const latestReach = reachData.values.length > 0 ? reachData.values[reachData.values.length - 1] : 0;
    const latestEngagement = engagementData.values.length > 0 ? engagementData.values[engagementData.values.length - 1] : 0;

    // Calculate current engagement rate if reach is not zero, otherwise 0
    const currentEngagementRate = latestReach > 0 ? ((latestEngagement / latestReach) * 100).toFixed(2) : 0;

    document.getElementById('engagementRateCurrent').textContent = `${currentEngagementRate}%`;
    document.getElementById('engagementRateGoal').textContent = `${kpiMeta.engagement.goal}%`;
    document.getElementById('engagementRecommendation').textContent = kpiMeta.engagement.recommendation;

    document.getElementById('reachCurrent').textContent = latestReach.toLocaleString();
    document.getElementById('reachGoal').textContent = kpiMeta.reach.goal.toLocaleString();
    document.getElementById('reachRecommendation').textContent = kpiMeta.reach.recommendation;

    document.getElementById('conversionRateCurrent').textContent = `${kpiMeta.conversion.current}%`;
    document.getElementById('conversionRateGoal').textContent = `${kpiMeta.conversion.goal}%`;
    document.getElementById('conversionRecommendation').textContent = kpiMeta.conversion.recommendation;
}


/**
 * Renders a Chart.js graph.
 * @param {string} kpiType - The type of KPI ('engagement', 'reach', 'conversion').
 * @param {string} chartId - The ID of the canvas element.
 * @param {string} title - The title of the chart.
 * @param {string} chartJsType - The Chart.js type ('bar', 'line').
 * @param {Array<string>} labels - Array of labels for the X-axis.
 * @param {Array<number>} values - Array of data values for the Y-axis.
 * @param {string} unit - The unit for the values (e.g., '%', '').
 */
function renderChart(kpiType, chartId, title, chartJsType, labels, values, unit = '') {
    const ctx = document.getElementById(chartId).getContext('2d');

    // Destroy existing chart instance if it exists
    if (chartInstances[kpiType]) {
        chartInstances[kpiType].destroy();
    }

    const datasets = [{
        label: title,
        data: values,
        borderColor: chartJsType === 'line' ? '#5b54f2' : ['#5b54f2', '#7B68EE'],
        backgroundColor: chartJsType === 'line' ? 'rgba(91, 84, 242, 0.2)' : ['#5b54f2', '#7B68EE'],
        fill: chartJsType === 'line' ? true : false,
        tension: chartJsType === 'line' ? 0.4 : 0, // Smooth line for line charts
        borderWidth: chartJsType === 'line' ? 2 : 1,
        borderRadius: chartJsType === 'bar' ? 5 : 0,
    }];

    chartInstances[kpiType] = new Chart(ctx, {
        type: chartJsType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                title: {
                    display: true,
                    text: title,
                    font: { size: 16, family: 'Roboto', weight: 'bold' },
                    color: '#333'
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 30, 0.9)',
                    titleFont: { family: 'Roboto', weight: 'bold' },
                    bodyFont: { family: 'Roboto' },
                    padding: 10,
                    cornerRadius: 5,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            label += context.parsed.y.toLocaleString() + unit;
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { 
                        font: { family: 'Roboto' }, 
                        color: '#666',
                        maxRotation: 45, // Rotate labels for better readability
                        minRotation: 0,
                        autoSkip: true, // Automatically skip labels if too crowded
                        maxTicksLimit: 10 // Limit the number of ticks to avoid overlap
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        font: { family: 'Roboto' },
                        color: '#666',
                        callback: function(value) {
                            return value.toLocaleString() + unit;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders all charts on the page based on the current granularity.
 * @param {string} currentGranularity - The granularity to use ('daily' or 'monthly').
 */
function renderAllCharts(currentGranularity) {
    const engagementLabels = processedChartData.engagement[currentGranularity].labels;
    const engagementValues = processedChartData.engagement[currentGranularity].values;
    const reachLabels = processedChartData.reach[currentGranularity].labels;
    const reachValues = processedChartData.reach[currentGranularity].values;

    renderChart(
        'engagement',
        'engagementChart',
        `${currentGranularity === 'daily' ? 'Daily' : 'Monthly'} Engagement`,
        'line',
        engagementLabels,
        engagementValues,
        ''
    );

    renderChart(
        'reach',
        'reachChart',
        `${currentGranularity === 'daily' ? 'Daily' : 'Monthly'} Reach`,
        'bar',
        reachLabels,
        reachValues,
        ''
    );

    // Conversion chart remains Goal vs. Current, not time-series
    renderChart(
        'conversion',
        'conversionChart',
        'Conversion Rate: Goal vs. Current',
        'bar',
        processedChartData.conversion.labels,
        processedChartData.conversion.values,
        '%'
    );
}

/**
 * Fetches all necessary performance data from the backend APIs, processes it,
 * and then triggers the rendering of KPI cards and charts.
 * @param {string} token - Firebase authentication token.
 * @param {string} startDateStr - Optional start date (YYYY-MM-DD).
 * @param {string} endDateStr - Optional end date (YYYY-MM-DD).
 * @param {string} platform - Optional platform filter ('all', 'tiktok', 'facebook').
 */
async function fetchAndProcessAllPerformanceData(token, startDateStr = null, endDateStr = null, platform = 'all') {
    let tiktokData = [];
    let facebookData = [];

    if (platform === 'all' || platform === 'tiktok') {
        tiktokData = await fetchData('/tiktokdata', token, startDateStr, endDateStr);
    }
    if (platform === 'all' || platform === 'facebook') {
        facebookData = await fetchData('/facebookdata', token, startDateStr, endDateStr);
    }

    // Combine all data
    const allSocialMediaData = [...tiktokData, ...facebookData];

    let currentGranularity = 'monthly';
    if (startDateStr && endDateStr) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= AGGREGATION_THRESHOLD_DAYS) {
            currentGranularity = 'daily';
        }
    }

    // Aggregate data based on determined granularity
    const dailyAggregated = aggregateData(allSocialMediaData, 'daily', startDateStr, endDateStr);
    const monthlyAggregated = aggregateData(allSocialMediaData, 'monthly');

    // Store processed data globally for charts
    processedChartData.engagement.daily = { labels: dailyAggregated.labels, values: dailyAggregated.engagement };
    processedChartData.engagement.monthly = { labels: monthlyAggregated.labels, values: monthlyAggregated.engagement };
    processedChartData.reach.daily = { labels: dailyAggregated.labels, values: dailyAggregated.reach };
    processedChartData.reach.monthly = { labels: monthlyAggregated.labels, values: monthlyAggregated.reach };
    // Conversion remains mock for now, or gets updated here if a new API is added

    // Update global filter state variables
    currentStartDate = startDateStr;
    currentEndDate = endDateStr;
    currentPlatformFilter = platform;


    // Update KPI cards with the latest aggregated values
    initializeKPICards();

    // Render all charts after data is processed using the current granularity
    renderAllCharts(currentGranularity);
}


// --- Main Initialization ---

document.addEventListener("DOMContentLoaded", () => {
    // Set a generic welcome message initially
    const welcomeEl = document.getElementById("welcome-message");
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome to Performance Evaluation!`;
    }

    // Initialize KPI cards with 'Loading...' state immediately
    initializeKPICards();

    // Event listener for Platform Filter Dropdown Items
    document.querySelectorAll('#platformFilterDropdown + .dropdown-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent default link behavior
            const platform = this.dataset.platform;
            const button = document.getElementById('platformFilterDropdown');
            button.textContent = `Platform: ${this.textContent}`;
            button.dataset.platform = platform; // Update the button's data attribute

            // Trigger data refetch with current date range and new platform
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    user.getIdToken().then((idToken) => {
                        fetchAndProcessAllPerformanceData(idToken, currentStartDate, currentEndDate, platform);
                    }).catch((error) => {
                        console.error("Error getting user ID token for platform filter:", error);
                    });
                } else {
                    console.warn("No user signed in. Cannot apply platform filter without authentication.");
                }
            });
        });
    });


    // Add event listener for the "Apply" button
    const applyButton = document.getElementById('applyDateFilter');
    if (applyButton) {
        applyButton.addEventListener('click', () => {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            
            // Validate dates
            if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) {
                console.error("Invalid date range selected. Please select a valid start and end date.");
                // Optionally, show a user-friendly message on the UI
                return;
            }

            // Only fetch data if an authenticated user is available
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    user.getIdToken().then((idToken) => {
                        fetchAndProcessAllPerformanceData(idToken, startDate, endDate, currentPlatformFilter);
                    }).catch((error) => {
                        console.error("Error getting user ID token for date filter:", error);
                    });
                } else {
                    console.warn("No user signed in. Cannot apply date filter without authentication.");
                    // Optionally, show a message to the user
                }
            });
        });
    }


    // Listen for Firebase auth state change to get the token and fetch data initially
    onAuthStateChanged(auth, (user) => {
        if (user) {
            user.getIdToken().then((idToken) => {
                // Set the welcome message with the actual user's display name
                setWelcomeMessage(user.displayName || user.email || "User");
                // Fetch and process data without date filters initially
                fetchAndProcessAllPerformanceData(idToken, null, null, currentPlatformFilter); // Pass initial platform filter
            }).catch((error) => {
                console.error("Error getting user ID token:", error);
                // Even without token, initialize UI with default/mock data
                initializeKPICards();
                renderAllCharts('monthly'); // Default to monthly if no user/error
            });
        } else {
            // User is signed out, handle as needed (e.g., redirect to login)
            console.log("No user signed in. Performance data will not be fetched.");
            setWelcomeMessage("Guest"); // Set welcome message for guest
            // Optionally, clear charts or show a message that data requires login
            initializeKPICards(); // Show default mock values/loading
            renderAllCharts('monthly'); // Default to monthly if no user
        }
    });
});
