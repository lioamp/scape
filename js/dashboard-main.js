// Import functions from other modules
import { getMonthYearAbbreviation } from './dashboard-utils.js';
import { fetchPlatformData, fetchSalesChartData, fetchTopPerformersData } from './dashboard-dataFetcher.js';
import { updateSummaryTotals } from './dashboard-summaryUpdater.js';
import { renderReachChart, renderEngagementChart, renderSalesChart, renderTopPerformersChart } from './dashboard-chartRenderers.js';

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
                // Store date key so we can sort and create labels later
                dateKey: yearMonthKey, 
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

    // Convert the aggregated map to an array and sort it by dateKey
    const sortedAggregatedData = Array.from(monthlyAggregatedData.values())
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey)); // Sort by "YYYY-MM" string

    // Prepare labels and datasets for Chart.js
    const labels = sortedAggregatedData.map(item => {
        // Reconstruct a date string from the dateKey to pass to getMonthYearAbbreviation
        return getMonthYearAbbreviation(`${item.dateKey}-01`); 
    });
    const reachData = sortedAggregatedData.map(item => item.reach);
    const engagementData = sortedAggregatedData.map(item => item.engagement);
    const salesData = sortedAggregatedData.map(item => item.sales);

    return { labels, reachData, engagementData, salesData };
}

/**
 * Shows a loading overlay for a specific chart.
 * @param {string} chartId - The ID of the chart's loading overlay element.
 */
function showChartLoading(chartId) {
    const overlay = document.getElementById(chartId);
    if (overlay) {
        overlay.style.display = 'flex'; // Ensure it's displayed as flex
    }
}

/**
 * Hides a loading overlay for a specific chart.
 * @param {string} chartId - The ID of the chart's loading overlay element.
 */
function hideChartLoading(chartId) {
    const overlay = document.getElementById(chartId);
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Renders the Summary Totals.
 * @param {Array<number>} reachData - Array of reach values.
 * @param {Array<number>} engagementData - Array of engagement values.
 * @param {Array<number>} salesData - Array of sales values.
 */
async function renderSummary(reachData, engagementData, salesData) {
    try {
        updateSummaryTotals(reachData, engagementData, salesData);
    } catch (error) {
        console.error("Error rendering summary:", error);
    } finally {
        hideChartLoading('summaryLoadingOverlay');
    }
}

/**
 * Renders the Reach Chart.
 * @param {Array<string>} labels - X-axis labels.
 * @param {Array<number>} reachData - Data for the reach chart.
 */
async function renderReach(labels, reachData) {
    try {
        renderReachChart(labels, reachData);
    } catch (error) {
        console.error("Error rendering reach chart:", error);
    } finally {
        hideChartLoading('reachChartLoadingOverlay');
    }
}

/**
 * Renders the Engagement Chart.
 * @param {Array<string>} labels - X-axis labels.
 * @param {Array<number>} engagementData - Data for the engagement chart.
 */
async function renderEngagement(labels, engagementData) {
    try {
        renderEngagementChart(labels, engagementData);
    } catch (error) {
        console.error("Error rendering engagement chart:", error);
    } finally {
        hideChartLoading('engagementChartLoadingOverlay');
    }
}

/**
 * Renders the Sales Chart.
 * @param {Array<string>} labels - X-axis labels.
 * @param {Array<number>} salesData - Data for the sales chart.
 */
async function renderSales(labels, salesData) {
    try {
        renderSalesChart(labels, salesData);
    } catch (error) {
        console.error("Error rendering sales chart:", error);
    } finally {
        hideChartLoading('salesChartLoadingOverlay');
    }
}

/**
 * Renders the Top Performers Chart.
 */
async function renderTopPerformers() {
    try {
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
    } catch (error) {
        console.error("Error rendering top performers chart:", error);
    } finally {
        hideChartLoading('topPerformersChartLoadingOverlay');
    }
}

/**
 * Main function to render all charts on the dashboard based on the selected platform and time range.
 * @param {string} platform - The platform to display data for ('tiktok', 'facebook', or 'all').
 * @param {string} timeRange - The time range to filter data ('last3months', 'last6months', 'lastYear', 'allTime').
 */
async function renderAllCharts(platform = 'all', timeRange = 'lastYear') { 
    console.log(`Rendering charts for platform: ${platform}, time range: ${timeRange}`);

    // Show all individual chart loading overlays immediately
    showChartLoading('summaryLoadingOverlay');
    showChartLoading('reachChartLoadingOverlay');
    showChartLoading('engagementChartLoadingOverlay');
    showChartLoading('salesChartLoadingOverlay');
    showChartLoading('topPerformersChartLoadingOverlay');


    try {
        let reachEngagementData = { rawData: [] };
        let salesChartRawData = [];

        // Fetch all necessary raw data concurrently
        [reachEngagementData, salesChartRawData] = await Promise.all([
            fetchPlatformData(platform),
            fetchSalesChartData(timeRange)
        ]);

        // Combine and aggregate data
        const combinedRawData = mergeData(reachEngagementData.rawData, salesChartRawData);
        const { labels, reachData, engagementData, salesData } = filterAndAggregateData(combinedRawData, timeRange);

        // Render charts and summary individually with their own loading states
        // Use Promise.all to allow charts to render concurrently
        await Promise.all([
            renderSummary(reachData, engagementData, salesData),
            renderReach(labels, reachData),
            renderEngagement(labels, engagementData),
            renderSales(labels, salesData),
            renderTopPerformers() // Top performers data is independent of platform/timeRange filters
        ]);

    } catch (error) {
        console.error("Error during chart rendering:", error);
        // In case of an error, ensure all overlays are hidden
        hideChartLoading('summaryLoadingOverlay');
        hideChartLoading('reachChartLoadingOverlay');
        hideChartLoading('engagementChartLoadingOverlay');
        hideChartLoading('salesChartLoadingOverlay');
        hideChartLoading('topPerformersChartLoadingOverlay');
    }
}

// Run after DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    // Initial render with 'all' platforms selected and 'lastYear' time range by default
    renderAllCharts('all', 'lastYear');

    // Add event listener for the platform filter dropdown
    const platformFilterDropdown = document.getElementById('platformFilterDropdown');
    if (platformFilterDropdown) {
        const dropdownMenu = platformFilterDropdown.nextElementSibling;
        if (dropdownMenu) {
            const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');

            dropdownItems.forEach(item => {
                item.addEventListener('click', function(event) {
                    event.preventDefault(); 
                    const selectedPlatform = this.dataset.platform;
                    platformFilterDropdown.textContent = `Platform: ${this.textContent}`; 
                    platformFilterDropdown.dataset.platform = selectedPlatform; 
                    const currentTimeRangeDropdown = document.getElementById('timeRangeFilterDropdown');
                    const currentTimeRange = currentTimeRangeDropdown ? currentTimeRangeDropdown.dataset.timeRange : 'lastYear'; 
                    renderAllCharts(selectedPlatform, currentTimeRange); 
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
                    event.preventDefault(); 
                    const selectedTimeRange = this.dataset.timeRange;
                    timeRangeFilterDropdown.textContent = `Time: ${this.textContent}`; 
                    timeRangeFilterDropdown.dataset.timeRange = selectedTimeRange; 
                    const currentPlatformDropdown = document.getElementById('platformFilterDropdown');
                    const currentPlatform = currentPlatformDropdown ? currentPlatformDropdown.dataset.platform : 'all'; 
                    renderAllCharts(currentPlatform, selectedTimeRange); 
                });
            });
        } else {
            console.warn("Time range filter dropdown menu not found. Check HTML structure for timeRangeFilterDropdown.");
        }
    } else {
        console.warn("Time range filter dropdown button not found. Check HTML structure.");
    }
});
