/**
 * Updates the summary totals displayed in the small cards.
 * @param {Array<number>} reachData - Array of reach values.
 * @param {Array<number>} engagementData - Array of engagement values.
 * @param {Array<number>} salesData - Array of sales values.
 */
export function updateSummaryTotals(reachData, engagementData, salesData) {
    const totalReach = reachData.reduce((a, b) => a + b, 0);
    const totalEngagement = engagementData.reduce((a, b) => a + b, 0);
    const totalSales = salesData.reduce((a, b) => a + b, 0);

    const summaryCard = document.querySelector('.row.g-3 > .col-12 > .card');
    if (!summaryCard) {
        console.warn("Summary card not found.");
        return;
    }

    const reachValueEl = summaryCard.querySelector('#summaryTotalReach');
    const engagementValueEl = summaryCard.querySelector('#summaryTotalEngagement');
    const salesValueEl = summaryCard.querySelector('#summaryTotalSales');

    if (reachValueEl) reachValueEl.textContent = totalReach.toLocaleString();
    if (engagementValueEl) engagementValueEl.textContent = totalEngagement.toLocaleString();
    if (salesValueEl) salesValueEl.textContent = totalSales.toLocaleString();
}
