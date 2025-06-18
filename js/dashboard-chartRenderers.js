// Assume Chart.js is loaded globally or imported elsewhere if not a module build.
// This file will contain functions to render individual charts.

/**
 * Common Chart.js options for all charts.
 */
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false, // Hide legend by default
            labels: {
                font: { family: 'Roboto' }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(30, 30, 30, 0.9)', // Darker tooltip background
            titleFont: { family: 'Roboto', weight: 'bold' },
            bodyFont: { family: 'Roboto' },
            padding: 10,
            cornerRadius: 5,
        },
        title: {
            display: true,
            font: {
                size: 16,
                family: 'Roboto',
                weight: 'bold'
            },
            color: '#333'
        }
    },
    scales: {
        x: {
            grid: {
                color: 'rgba(0, 0, 0, 0.05)', // Lighter grid lines
                drawBorder: false,
            },
            ticks: {
                font: { family: 'Roboto' },
                color: '#666',
            },
            title: {
                display: true,
                font: { family: 'Roboto', weight: 'bold' },
                color: '#333'
            }
        },
        y: {
            beginAtZero: true,
            grid: {
                color: 'rgba(0, 0, 0, 0.05)', // Lighter grid lines
                drawBorder: false,
            },
            ticks: {
                font: { family: 'Roboto' },
                color: '#666',
                callback: function(value) {
                    // Format large numbers for Y-axis (e.g., 1000000 -> 1M)
                    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                    return value;
                }
            },
            title: {
                display: true,
                font: { family: 'Roboto', weight: 'bold' },
                color: '#333'
            }
        }
    }
};

/**
 * Renders the Reach Chart (Bar Chart).
 * @param {Array<string>} labels - X-axis labels.
 * @param {Array<number>} reachData - Data for the reach chart.
 */
export function renderReachChart(labels, reachData) {
    const reachCtx = document.getElementById('reachChart').getContext('2d');
    if (window.reachChartInstance) window.reachChartInstance.destroy();
    window.reachChartInstance = new Chart(reachCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Reach',
                data: reachData,
                backgroundColor: 'rgba(123, 104, 238, 0.7)',
                borderColor: 'rgba(123, 104, 238, 1)',
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    ...commonOptions.plugins.title,
                    text: 'Monthly Reach'
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US').format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...commonOptions.scales.x,
                    title: { ...commonOptions.scales.x.title, text: 'Month and Year' }
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Reach' }
                }
            }
        }
    });
}

/**
 * Renders the Engagement Chart (Line Chart).
 * @param {Array<string>} labels - X-axis labels.
 * @param {Array<number>} engagementData - Data for the engagement chart.
 */
export function renderEngagementChart(labels, engagementData) {
    const engagementCtx = document.getElementById('engagementChart').getContext('2d');
    if (window.engagementChartInstance) window.engagementChartInstance.destroy();
    window.engagementChartInstance = new Chart(engagementCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Engagement',
                data: engagementData,
                fill: true,
                backgroundColor: 'rgba(90, 76, 209, 0.2)',
                borderColor: 'rgba(90, 76, 209, 1)',
                tension: 0.4,
                pointBackgroundColor: 'rgba(90, 76, 209, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(90, 76, 209, 1)',
                pointRadius: 5,
                pointHoverRadius: 7,
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    ...commonOptions.plugins.title,
                    text: 'Monthly Engagement'
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US').format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...commonOptions.scales.x,
                    title: { ...commonOptions.scales.x.title, text: 'Month and Year' }
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Engagement' }
                }
            }
        }
    });
}

/**
 * Renders the Monthly Sales Chart (Bar Chart).
 * @param {Array<string>} labels - X-axis labels.
 * @param {Array<number>} salesData - Data for the sales chart.
 */
export function renderSalesChart(labels, salesData) {
    const salesCtx = document.getElementById('salesChart').getContext('2d');
    if (window.salesChartInstance) window.salesChartInstance.destroy();
    window.salesChartInstance = new Chart(salesCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Sales',
                data: salesData,
                backgroundColor: 'rgba(170, 150, 250, 0.7)',
                borderColor: 'rgba(170, 150, 250, 1)',
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    ...commonOptions.plugins.title,
                    text: 'Monthly Sales' // Keeping monthly as per original request
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                // Changed currency to PHP
                                label += new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...commonOptions.scales.x,
                    title: { ...commonOptions.scales.x.title, text: 'Month and Year' } 
                },
                y: {
                    ...commonOptions.scales.y,
                    title: { ...commonOptions.scales.y.title, text: 'Total Sales (PHP)' }, // Changed title to reflect PHP
                    ticks: {
                        ...commonOptions.scales.y.ticks,
                        callback: function(value) {
                             // Format large numbers for Y-axis with PHP currency symbol
                            if (value >= 1000000) return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', compactDisplay: 'short' }).format(value);
                            if (value >= 1000) return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', compactDisplay: 'short' }).format(value);
                            return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value);
                        }
                    }
                }
            }
        }
    });
}


/**
 * Renders the Top Performers chart using Chart.js.
 * @param {Array<Object>} performersData - An array of objects, each with 'product_name' and 'sales'.
 */
export function renderTopPerformersChart(performersData) {
    const topPerformersCtx = document.getElementById('topPerformersChart'); 
    if (!topPerformersCtx) {
        console.error("Canvas element 'topPerformersChart' not found.");
        return;
    }

    if (window.topPerformersChartInstance) {
        window.topPerformersChartInstance.destroy();
        window.topPerformersChartInstance = null; 
    }

    const labels = performersData.map(item => item.product_name);
    const data = performersData.map(item => item.sales);

    window.topPerformersChartInstance = new Chart(topPerformersCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales',
                data: data,
                backgroundColor: 'linear-gradient(135deg, #7B68EE, #5A4CD1)', 
                borderColor: 'rgba(123, 104, 238, 1)', 
                borderWidth: 1,
                borderRadius: 5, 
            }]
        },
        options: {
            indexAxis: 'y', 
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false 
                },
                title: {
                    display: true,
                    text: 'Top Performers by Sales',
                    font: {
                        size: 16,
                        family: 'Roboto',
                        weight: 'bold'
                    },
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
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.x !== null) {
                                // Changed currency to PHP
                                label += new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(context.parsed.x);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)', 
                        drawBorder: false, 
                    },
                    ticks: {
                        font: { family: 'Roboto' },
                        color: '#666',
                        callback: function(value) {
                             // Format large numbers for X-axis with PHP currency symbol
                            if (value >= 1000000) return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', compactDisplay: 'short' }).format(value);
                            if (value >= 1000) return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', compactDisplay: 'short' }).format(value);
                            return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value);
                        }
                    }
                },
                y: {
                    grid: {
                        display: false, 
                        drawBorder: false,
                    },
                    ticks: {
                        font: { family: 'Roboto' },
                        color: '#333'
                    },
                    title: {
                        display: true,
                        text: 'Product Name',
                        font: { family: 'Roboto', weight: 'bold' },
                        color: '#333'
                    }
                }
            }
        },
        plugins: [{
            id: 'topPerformersGradient', 
            beforeUpdate: function(chart) { 
                const ctx = chart.ctx;
                const gradient = ctx.createLinearGradient(0, 0, chart.width, 0);
                gradient.addColorStop(0, '#7B68EE'); 
                gradient.addColorStop(1, '#5A4CD1'); 
                
                chart.data.datasets.forEach(dataset => {
                    dataset.backgroundColor = gradient;
                });
            }
        }]
    });
}
