class AdminPanel {
    constructor() {
        this.socket = null;
        this.dashboardState = null;
        
        this.init();
    }

    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.setupKioskControls(); // Add kiosk controls
        this.loadInitialData();
    }

    setupSocket() {
        this.socket = io();
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        this.socket.on('connect', () => {
            console.log('Admin connected to server');
            statusDot.className = 'status-dot';
            statusText.textContent = 'Connected';
        });
        
        this.socket.on('disconnect', () => {
            console.log('Admin disconnected from server');
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Disconnected';
        });
        
        this.socket.on('dashboardState', (state) => {
            this.dashboardState = state;
            this.updateAdminDisplay(state);
        });
        
        this.socket.on('pageChanged', (pageIndex) => {
            this.updateCurrentPageDisplay(pageIndex);
        });
        
        this.socket.on('settingsUpdated', (state) => {
            this.dashboardState = state;
            this.updateAdminDisplay(state);
        });
        
        statusDot.className = 'status-dot connecting';
        statusText.textContent = 'Connecting...';
    }

    setupEventListeners() {
        // Auto cycle toggle
        const autoCycleToggle = document.getElementById('auto-cycle');
        if (autoCycleToggle) {
            autoCycleToggle.addEventListener('change', (e) => {
                this.socket.emit('updateSettings', {
                    autoCycle: e.target.checked
                });
            });
        }
        
        // Cycle interval update
        const cycleInterval = document.getElementById('cycle-interval');
        if (cycleInterval) {
            cycleInterval.addEventListener('change', (e) => {
                const interval = parseInt(e.target.value) * 1000; // Convert to milliseconds
                this.socket.emit('updateSettings', {
                    cycleInterval: interval
                });
            });
        }
    }

    setupKioskControls() {
        // Remove keyboard shortcuts and touch controls
        // Admin page uses UI buttons instead
        console.log('🎮 Admin page using UI buttons for controls');
        
        // Only prevent context menu in kiosk scenarios
        document.addEventListener('contextmenu', (e) => {
            // Only prevent if not in a form field
            if (!e.target.matches('input, textarea, select')) {
                e.preventDefault();
            }
        });
    }

    // Kiosk helper methods for UI buttons
    exitKioskMode() {
        console.log('🚪 Attempting to exit kiosk mode...');
        
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        try {
            window.close();
        } catch (e) {
            console.log('Cannot close window - not opened by script');
        }
        
        this.showNotification('Press Alt+F4 or Ctrl+W to close, or use window controls', 4000);
    }

    goToDashboard() {
        console.log('🖥️ Redirecting to dashboard...');
        window.location.href = '/';
    }

    showNotification(message, duration = 2000) {
        const existing = document.getElementById('admin-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'admin-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 0.9rem;
            z-index: 999997;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(10px);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    async loadInitialData() {
        try {
            // Load dashboard state
            const stateResponse = await fetch('/api/dashboard/state');
            if (stateResponse.ok) {
                this.dashboardState = await stateResponse.json();
                this.updateAdminDisplay(this.dashboardState);
            }
            
            // Check weather API status
            this.checkWeatherAPI();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async checkWeatherAPI() {
        try {
            const response = await fetch('/api/weather');
            const statusElement = document.getElementById('weather-api-status');
            
            if (response.ok) {
                statusElement.textContent = 'Working';
                statusElement.style.color = '#4CAF50';
            } else {
                statusElement.textContent = 'Error';
                statusElement.style.color = '#f44336';
            }
        } catch (error) {
            const statusElement = document.getElementById('weather-api-status');
            statusElement.textContent = 'Not configured';
            statusElement.style.color = '#ff9800';
        }
    }

    updateAdminDisplay(state) {
        if (!state) return;
        
        console.log('Updating admin display with state:', state);
        
        // Update auto cycle toggle
        const autoCycleToggle = document.getElementById('auto-cycle');
        if (autoCycleToggle) {
            autoCycleToggle.checked = state.autoCycle;
        }
        
        // Update cycle interval
        const cycleInterval = document.getElementById('cycle-interval');
        if (cycleInterval) {
            cycleInterval.value = Math.floor(state.cycleInterval / 1000);
        }
        
        // Update current page info
        this.updateCurrentPageDisplay(state.currentPage);
        
        // Update last updated time
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated && state.lastUpdated) {
            const date = new Date(state.lastUpdated);
            lastUpdated.textContent = date.toLocaleTimeString();
        }
        
        // Update weather city if available - ALWAYS update this field
        const weatherCity = document.getElementById('weather-city');
        if (weatherCity) {
            if (state.settings && state.settings.city) {
                console.log('Setting city field to:', state.settings.city);
                weatherCity.value = state.settings.city;
            } else {
                console.log('No city in state, setting default');
                weatherCity.value = 'Dallas,US';
            }
        }
        
        // Update weather units if available
        if (state.settings && state.settings.units) {
            const weatherUnits = document.getElementById('weather-units');
            if (weatherUnits) {
                weatherUnits.value = state.settings.units;
            }
        }
        
        // Update API key status
        this.updateApiKeyStatus(state.settings && state.settings.weatherApiKey);
    }

    updateApiKeyStatus(hasApiKey) {
        const statusElement = document.getElementById('api-key-indicator');
        const statusContainer = document.getElementById('api-key-status');
        
        if (statusElement && statusContainer) {
            if (hasApiKey) {
                statusElement.textContent = 'API key saved (•••••••••••••••)';
                statusContainer.className = 'api-status has-key';
            } else {
                statusElement.textContent = 'No API key saved';
                statusContainer.className = 'api-status no-key';
            }
        }
    }

    updateCurrentPageDisplay(pageIndex) {
        const pageNames = [
            'Page 1: Date & Weather',
            'Page 2: Calendar & Events'
        ];
        
        const currentPageElement = document.getElementById('current-page');
        const currentPageInfo = document.getElementById('current-page-info');
        
        if (currentPageElement && pageNames[pageIndex]) {
            currentPageElement.textContent = pageNames[pageIndex];
        }
        
        if (currentPageInfo) {
            currentPageInfo.textContent = pageIndex + 1;
        }
    }
}

// Global functions for button clicks
function changePage(pageIndex) {
    if (window.adminPanel && window.adminPanel.socket) {
        window.adminPanel.socket.emit('changePage', pageIndex);
    }
}

function updateCycleInterval() {
    const interval = document.getElementById('cycle-interval').value;
    if (window.adminPanel && window.adminPanel.socket) {
        window.adminPanel.socket.emit('updateSettings', {
            cycleInterval: parseInt(interval) * 1000
        });
    }
}

async function checkApiUsage() {
    try {
        const response = await fetch('/api/usage');
        if (response.ok) {
            const usage = await response.json();
            const resetTime = usage.resetTime ? new Date(usage.resetTime).toLocaleString() : 'Unknown';
            
            let statusMessage = '';
            if (usage.status === 'limit_reached') {
                statusMessage = '⚠️ LIMIT REACHED';
            } else if (usage.status === 'warning') {
                statusMessage = '⚠️ HIGH USAGE';
            } else {
                statusMessage = '✅ OK';
            }
            
            alert(`API Usage Status: ${statusMessage}\n\n` +
                  `📊 Daily Usage:\n` +
                  `Calls today: ${usage.callsToday}/${usage.maxCallsPerDay} (${usage.percentUsed}%)\n` +
                  `Remaining: ${usage.remaining} calls\n` +
                  `Resets at: ${resetTime}\n\n` +
                  `⚡ Per-Minute Usage:\n` +
                  `Calls last minute: ${usage.callsLastMinute}/${usage.maxCallsPerMinute}\n\n` +
                  `💡 Official OpenWeatherMap limits:\n` +
                  `• 1,000 calls per day (FREE)\n` +
                  `• 60 calls per minute\n` +
                  `• Weather updates every 30 minutes to conserve calls`);
        } else {
            alert('Failed to fetch API usage information');
        }
    } catch (error) {
        console.error('Error checking API usage:', error);
        alert('Error checking API usage');
    }
}

async function showCurrentApiKey() {
    try {
        const response = await fetch('/api/dashboard/state');
        if (response.ok) {
            const state = await response.json();
            const apiKey = state.settings?.weatherApiKey;
            
            if (apiKey) {
                const maskedKey = `${apiKey.substring(0, 8)}${'*'.repeat(apiKey.length - 12)}${apiKey.substring(apiKey.length - 4)}`;
                alert(`Current API Key:\n${maskedKey}\n\nFull key: ${apiKey}`);
            } else {
                alert('No API key is currently saved.');
            }
        } else {
            alert('Failed to retrieve API key information.');
        }
    } catch (error) {
        console.error('Error retrieving API key:', error);
        alert('Error retrieving API key information.');
    }
}

function toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('weather-api-key');
    const toggleButton = apiKeyInput.nextElementSibling;
    
    if (apiKeyInput && toggleButton) {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleButton.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleButton.textContent = '👁️';
        }
    }
}

async function updateApiKey() {
    const apiKey = document.getElementById('weather-api-key').value.trim();
    
    if (!apiKey) {
        alert('Please enter an API key');
        return;
    }
    
    if (apiKey.length < 10) {
        alert('API key seems too short. Please check your OpenWeatherMap API key.');
        return;
    }
    
    try {
        console.log('Saving API key...');
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ weatherApiKey: apiKey })
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            alert('API key saved successfully! Testing weather...');
            // Clear the password field for security
            document.getElementById('weather-api-key').value = '';
            // Test the weather immediately
            setTimeout(testWeather, 1000);
        } else {
            console.error('API key save failed:', responseData);
            alert(`Failed to save API key: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving API key:', error);
        alert('Error saving API key. Please check the console for details.');
    }
}

async function testWeather() {
    const statusElement = document.getElementById('weather-api-status');
    if (statusElement) {
        statusElement.textContent = 'Testing...';
        statusElement.style.color = '#ff9800';
    }
    
    try {
        const response = await fetch('/api/weather?test=true');
        
        if (response.ok) {
            const weatherData = await response.json();
            if (statusElement) {
                statusElement.textContent = 'Working ✓';
                statusElement.style.color = '#4CAF50';
            }
            
            alert(`Weather test successful!\n` +
                  `Location: ${weatherData.current.city}, ${weatherData.current.country}\n` +
                  `Temperature: ${weatherData.current.temperature}°\n` +
                  `Condition: ${weatherData.current.description}`);
        } else {
            const errorData = await response.json();
            if (statusElement) {
                statusElement.textContent = 'Error ✗';
                statusElement.style.color = '#f44336';
            }
            
            if (errorData.error.includes('API key')) {
                alert('API Key Error: Please check that your OpenWeatherMap API key is correct and active. ' +
                      'New API keys can take up to 2 hours to activate.');
            } else if (errorData.error.includes('city')) {
                alert('City Error: Please check that the city name is spelled correctly (e.g., "Dallas,US" or "London,GB")');
            } else {
                alert(`Weather API Error: ${errorData.error}`);
            }
        }
    } catch (error) {
        console.error('Error testing weather:', error);
        if (statusElement) {
            statusElement.textContent = 'Connection Error';
            statusElement.style.color = '#f44336';
        }
        alert('Error connecting to weather service');
    }
}

async function updateWeatherCity() {
    const city = document.getElementById('weather-city').value.trim();
    
    if (!city) {
        alert('Please enter a city name');
        return;
    }
    
    // Validate city format
    if (!city.includes(',')) {
        alert('Please use format: "City,Country" (e.g., "Dallas,US" or "London,GB")');
        return;
    }
    
    try {
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ city })
        });
        
        if (response.ok) {
            alert('Weather city updated successfully!');
            refreshWeather();
        } else {
            const errorData = await response.json();
            alert(`Failed to update weather city: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error updating weather city:', error);
        alert('Error updating weather city');
    }
}

async function updateWeatherUnits() {
    const units = document.getElementById('weather-units').value;
    try {
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ units })
        });
        
        if (response.ok) {
            alert('Weather units updated successfully!');
            refreshWeather();
        } else {
            alert('Failed to update weather units');
        }
    } catch (error) {
        console.error('Error updating weather units:', error);
        alert('Error updating weather units');
    }
}

async function refreshWeather() {
    try {
        const response = await fetch('/api/weather');
        if (response.ok) {
            alert('Weather data refreshed!');
            if (window.adminPanel) {
                window.adminPanel.checkWeatherAPI();
            }
        } else {
            alert('Failed to refresh weather data');
        }
    } catch (error) {
        console.error('Error refreshing weather:', error);
        alert('Error refreshing weather data');
    }
}

async function refreshAll() {
    try {
        // Refresh weather
        await fetch('/api/weather');
        
        // Refresh calendar
        await fetch('/api/calendar');
        
        alert('All data refreshed successfully!');
        
        if (window.adminPanel) {
            window.adminPanel.loadInitialData();
        }
    } catch (error) {
        console.error('Error refreshing data:', error);
        alert('Error refreshing data');
    }
}

async function resetToDefaults() {
    if (confirm('Reset all settings to defaults?\n\nThis will:\n• Reset city to Dallas,US\n• Reset units to Imperial\n• Reset auto-cycle to enabled\n• Keep your saved API key\n\nContinue?')) {
        try {
            const response = await fetch('/api/dashboard/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                alert('Settings reset to defaults successfully!');
                
                // Reload the admin panel to show updated values
                if (window.adminPanel) {
                    window.adminPanel.loadInitialData();
                }
                
                // Refresh the page to reload form values
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                const errorData = await response.json();
                alert(`Failed to reset settings: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error resetting to defaults:', error);
            alert('Error resetting settings');
        }
    }
}

function fullscreenDashboard() {
    // Redirect to dashboard instead of opening new window
    window.location.href = '/';
}

// Initialize admin panel when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.adminPanel && window.adminPanel.socket) {
        window.adminPanel.socket.disconnect();
    }
});