// Assume auth.js handles Firebase initialization and auth state

async function fetchPredictiveData(token) {
    try {
        const response = await fetch("http://localhost:5000/api/predictive-analytics", {
            headers: { Authorization: token }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to fetch predictive analytics data");
        }
        const data = await response.json();
        renderPredictiveChart(data);
    } catch (error) {
        alert("Error loading predictive analytics: " + error.message);
        console.error("Error loading predictive analytics:", error.message);
    }
}

function renderPredictiveChart(data) {
    // Render chart or display data on the page
    // Placeholder: console log
    console.log("Predictive analytics data:", data);
}

function initializePredictiveAnalytics() {
    if (window.currentUserToken) {
        fetchPredictiveData(window.currentUserToken);
    } else {
        const interval = setInterval(() => {
            if (window.currentUserToken) {
                clearInterval(interval);
                fetchPredictiveData(window.currentUserToken);
            }
        }, 500);
    }
}

initializePredictiveAnalytics();
