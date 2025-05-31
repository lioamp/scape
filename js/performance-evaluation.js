// Assume auth.js handles Firebase initialization and auth state

async function fetchPerformanceData(token) {
    try {
        const response = await fetch("http://localhost:5000/api/performance-evaluation", {
            headers: { Authorization: token }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to fetch performance data");
        }
        const data = await response.json();
        renderPerformanceChart(data);
    } catch (error) {
        alert("Error loading performance data: " + error.message);
        console.error("Error loading performance data:", error.message);
    }
}

function renderPerformanceChart(data) {
    // Render performance chart or display data on the page
    console.log("Performance evaluation data:", data);
}

function initializePerformanceEvaluation() {
    if (window.currentUserToken) {
        fetchPerformanceData(window.currentUserToken);
    } else {
        const interval = setInterval(() => {
            if (window.currentUserToken) {
                clearInterval(interval);
                fetchPerformanceData(window.currentUserToken);
            }
        }, 500);
    }
}

initializePerformanceEvaluation();
