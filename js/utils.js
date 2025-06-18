// Utility to convert date string (YYYY-MM-DD) to month abbreviation and year
// e.g., "2023-11-15" becomes "Nov 2023"
export function getMonthYearAbbreviation(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(dateStr);
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Utility to convert date string (YYYY-MM-DD) to Quarter and Year abbreviation
// (Kept in case you decide to use it in the future, even if not enabled now)
export function getQuarterYearAbbreviation(dateStr) {
    const date = new Date(dateStr);
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();
    const quarter = Math.floor(month / 3) + 1; // Q1 (Jan-Mar), Q2 (Apr-Jun), etc.
    return `Q${quarter} ${year}`;
}
