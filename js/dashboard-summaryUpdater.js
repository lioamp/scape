/**
 * Updates the summary totals displayed in the individual summary cards.
 * @param {Array<number>} reachData - Array of reach values.
 * @param {Array<number>} engagementData - Array of engagement values.
 * @param {Array<number>} salesData - Array of sales values.
 */
export function updateSummaryTotals(reachData, engagementData, salesData) {
    const totalReach = reachData.reduce((a, b) => a + b, 0);
    const totalEngagement = engagementData.reduce((a, b) => a + b, 0);
    const totalSales = salesData.reduce((a, b) => a + b, 0);

    // Directly target the individual elements by their IDs
    const reachValueEl = document.getElementById('summaryTotalReach');
    const engagementValueEl = document.getElementById('summaryTotalEngagement');
    const salesValueEl = document.getElementById('summaryTotalSales');

    // Ensure elements are found before updating textContent
    if (reachValueEl) reachValueEl.textContent = totalReach.toLocaleString();
    else console.warn("Summary Total Reach element not found.");

    if (engagementValueEl) engagementValueEl.textContent = totalEngagement.toLocaleString();
    else console.warn("Summary Total Engagement element not found.");

    if (salesValueEl) salesValueEl.textContent = totalSales.toLocaleString();
    else console.warn("Summary Total Sales element not found.");
}
