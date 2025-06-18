// Assume auth.js handles Firebase initialization and auth state

async function fetchCorrelationData(token) {
    try {
        const response = await fetch("http://localhost:5000/api/correlation-analysis", {
            headers: { Authorization: token }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to fetch correlation data");
        }
        const data = await response.json();
        renderCorrelationChart(data);
    } catch (error) {
        alert("Error loading correlation data: " + error.message);
        console.error("Error loading correlation data:", error.message);
    }
}

function renderCorrelationChart(data) {
    // Render correlation chart or display data on the page
    console.log("Correlation analysis data:", data);
}

function initializeCorrelationAnalysis() {
    if (window.currentUserToken) {
        fetchCorrelationData(window.currentUserToken);
    } else {
        const interval = setInterval(() => {
            if (window.currentUserToken) {
                clearInterval(interval);
                fetchCorrelationData(window.currentUserToken);
            }
        }, 500);
    }
}

initializeCorrelationAnalysis();
