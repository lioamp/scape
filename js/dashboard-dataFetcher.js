// Function to fetch data for TikTok, Facebook, or both
export async function fetchPlatformData(platform) { // Removed timeRange parameter
    let normalizedData = [];
    const CACHE_KEY = `platformData_${platform}`; 
    const CACHE_EXPIRATION_MS = 10 * 1000; // 10 seconds

    try {
        const token = window.currentUserToken; // Get token from global scope set by auth.js
        if (!token) {
            console.error(`Authentication token not available for ${platform} data. Please ensure you are logged in. Returning empty data.`);
            // Optionally, show a custom alert here too, but typically done by auth.js or calling script.
            // showCustomAlert("Authentication token not available.", "Authentication Required");
            return { rawData: [] };
        }

        // Try to load from cache
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            if (Date.now() - timestamp < CACHE_EXPIRATION_MS) {
                console.log(`Using cached data for platform: ${platform}`);
                return { rawData: data };
            } else {
                console.log(`Cached data for platform: ${platform} expired.`);
            }
        }

        console.log(`Fetching data for ${platform} (from API)...`);
        
        // Headers for authenticated requests
        const authHeaders = {
            'Authorization': `Bearer ${token}` 
        };

        if (platform === 'all') {
            const [tiktokResponse, facebookResponse] = await Promise.all([
                fetch('http://127.0.0.1:5000/api/tiktokdata', { headers: authHeaders }),
                fetch('http://127.0.0.1:5000/api/facebookdata', { headers: authHeaders })
            ]);

            let tiktokRawData = tiktokResponse.ok ? await tiktokResponse.json() : [];
            let facebookRawData = facebookResponse.ok ? await facebookResponse.json() : [];

            // IMPORTANT: Add console logs here to inspect the raw data
            console.log(`Raw TikTok data fetched for dashboard:`, tiktokRawData);
            console.log(`Raw Facebook data fetched for dashboard:`, facebookRawData);


            const normalizedTikTok = tiktokRawData.map(item => ({
                date: item.date,
                reach: item.views ?? 0,
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0),
                sales: 0
            }));

            const normalizedFacebook = facebookRawData.map(item => ({
                date: item.date || item.Date, // Handle both 'date' and 'Date' for safety
                reach: item.reach ?? item.Reach ?? 0, // Handle both 'reach' and 'Reach' for safety
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0),
                sales: item.sales ?? item.Sales ?? 0
            }));

            normalizedData = [...normalizedTikTok, ...normalizedFacebook];

        } else if (platform === 'tiktok') {
            const response = await fetch('http://127.0.0.1:5000/api/tiktokdata', { headers: authHeaders });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            let rawData = await response.json();
            console.log(`Raw TikTok data fetched for dashboard (${platform} specific):`, rawData);
            normalizedData = rawData.map(item => ({
                date: item.date,
                reach: item.views ?? 0,
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0),
                sales: 0
            }));

        } else if (platform === 'facebook') {
            const response = await fetch('http://127.0.0.1:5000/api/facebookdata', { headers: authHeaders });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            let rawData = await response.json();
            console.log(`Raw Facebook data fetched for dashboard (${platform} specific):`, rawData);
            normalizedData = rawData.map(item => ({
                date: item.date || item.Date,
                reach: item.reach ?? item.Reach ?? 0,
                engagement: (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0),
                sales: item.sales ?? item.Sales ?? 0
            }));
        } else {
            console.warn("Invalid platform selected:", platform);
            return null;
        }

        // Cache the new data
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: normalizedData, timestamp: Date.now() }));

        console.log(`Normalized ${platform} raw data fetched (from API):`, normalizedData);
        return { rawData: normalizedData };
    } catch (error) {
        console.error(`Error fetching ${platform} data:`, error);
        console.log(`Failed to load ${platform} data. Please check the server connection and data source.`);
        return { rawData: [] };
    }
}

// Function to fetch sales data
export async function fetchSalesChartData(timeRange) {
    const CACHE_KEY = `salesData_${timeRange}`;
    const CACHE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

    try {
        const token = window.currentUserToken; // Get token for sales data too, just in case
        // Only include Authorization header if token exists. Sales data might not require it.
        const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {}; 

        // Try to load from cache
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            if (Date.now() - timestamp < CACHE_EXPIRATION_MS) {
                console.log(`Using cached sales data for time range: ${timeRange}`);
                return data;
            } else {
                console.log(`Cached sales data for time range: ${timeRange} expired.`);
            }
        }

        let url = 'http://127.0.0.1:5000/api/salesdata';
        const now = new Date();
        let startDate = null;

        switch (timeRange) {
            case 'last3months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                break;
            case 'last6months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                break;
            case 'lastYear':
                // For 'lastYear', fetch data from the 1st day of the current month, one year ago.
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); 
                break;
            case 'allTime':
            default:
                break; 
        }

        if (startDate) {
            const startYear = startDate.getFullYear();
            const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
            const startDay = String(startDate.getDate()).padStart(2, '0');
            url += `?start_date=${startYear}-${startMonth}-${startDay}`;
        }

        console.log("Fetching sales chart data from URL (from API):", url);
        const response = await fetch(url, { headers: authHeaders }); // Added headers here
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        const normalizedData = data.map(item => ({
            date: item.date,
            reach: 0,        
            engagement: 0,   
            sales: item.revenue ?? 0 
        }));

        // Cache the new data
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: normalizedData, timestamp: Date.now() }));

        console.log("Raw sales chart data from API:", normalizedData); 
        return normalizedData;
    } catch (error) {
        console.error('Error fetching sales chart data:', error);
        return [];
    }
}

// Function to fetch top performers data
export async function fetchTopPerformersData(timeRange) { // Added timeRange parameter
    const CACHE_KEY = `topPerformersData_${timeRange}`; // Updated cache key to include timeRange
    const CACHE_EXPIRATION_MS = 5 * 1000; // 5 seconds

    try {
        const token = window.currentUserToken; // Get token for top performers data too
        // Only include Authorization header if token exists.
        const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

        // Try to load from cache
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            if (Date.now() - timestamp < CACHE_EXPIRATION_MS) {
                console.log(`Using cached top performers data for time range: ${timeRange}.`);
                return data;
            } else {
                console.log(`Cached top performers data for time range: ${timeRange} expired.`);
            }
        }

        let url = 'http://127.0.0.1:5000/api/sales/top';
        const now = new Date();
        let startDate = null;

        // Determine start date based on timeRange for the API call
        switch (timeRange) {
            case 'last3months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                break;
            case 'last6months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                break;
            case 'lastYear':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); // Consistent with main.js now
                break;
            case 'allTime':
            default:
                break; 
        }

        if (startDate) {
            const startYear = startDate.getFullYear();
            const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
            const startDay = String(startDate.getDate()).padStart(2, '0');
            // Add start_date to the URL if a time range is selected
            url += `?start_date=${startYear}-${startMonth}-${startDay}`;
        }

        console.log("Fetching top performers data from URL (from API):", url);
        const response = await fetch(url, { headers: authHeaders }); // Added headers here
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        
        // Cache the new data
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, timestamp: Date.now() }));

        console.log("Top Performers API data:", data);
        return data; 
    } catch (error) {
        console.error('Error fetching top performers data:', error);
        console.log('Failed to load top performers data. Please check the server connection and data source.');
        return [];
    }
}
