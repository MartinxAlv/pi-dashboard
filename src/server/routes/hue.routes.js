const express = require('express');
const HueService = require('../services/hue.service');
const SettingsService = require('../services/settings.service');

const router = express.Router();
const hueService = new HueService();
const settingsService = new SettingsService();

// Get all lights
router.get('/', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const bridgeIp = dashboardState.settings.hueBridgeIp;
        const username = dashboardState.settings.hueUsername;
        
        // If no bridge configured, return sample data
        if (!bridgeIp || !username) {
            console.log('💡 Hue not configured, returning sample lights');
            const sampleLights = hueService.getSampleLights();
            dashboardState.hue = { lights: sampleLights, configured: false };
            return res.json({ lights: sampleLights, configured: false });
        }

        const result = await hueService.getLights(bridgeIp, username);
        
        if (result.success) {
            dashboardState.hue = { lights: result.lights, configured: true };
            dashboardState.lastUpdated = new Date();
            res.json({ lights: result.lights, configured: true });
        } else {
            throw new Error('Failed to get lights');
        }
        
    } catch (error) {
        console.error('❌ Hue API error:', error.message);
        
        // Return sample lights on error so dashboard still works
        const fallbackLights = hueService.getSampleLights();
        req.app.locals.dashboardState.hue = { 
            lights: fallbackLights, 
            configured: false, 
            error: error.message 
        };
        
        res.status(500).json({ 
            error: error.message, 
            lights: fallbackLights,
            configured: false
        });
    }
});

// Control a specific light
router.put('/lights/:id', async (req, res) => {
    try {
        const { dashboardState, io } = req.app.locals;
        const bridgeIp = dashboardState.settings.hueBridgeIp;
        const username = dashboardState.settings.hueUsername;
        const lightId = req.params.id;
        const state = req.body;
        
        if (!bridgeIp || !username) {
            return res.status(400).json({ error: 'Hue bridge not configured' });
        }

        await hueService.controlLight(bridgeIp, username, lightId, state);
        
        // Update the light state in memory
        if (dashboardState.hue && dashboardState.hue.lights) {
            const light = dashboardState.hue.lights.find(l => l.id == lightId);
            if (light) {
                Object.assign(light, state);
            }
        }
        
        // Broadcast update to all connected clients
        io.emit('hueUpdated', dashboardState.hue);
        
        res.json({ success: true, message: `Light ${lightId} updated` });
        
    } catch (error) {
        console.error(`❌ Failed to control light ${req.params.id}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// Control all lights
router.put('/lights', async (req, res) => {
    try {
        const { dashboardState, io } = req.app.locals;
        const bridgeIp = dashboardState.settings.hueBridgeIp;
        const username = dashboardState.settings.hueUsername;
        const state = req.body;
        
        if (!bridgeIp || !username) {
            return res.status(400).json({ error: 'Hue bridge not configured' });
        }

        await hueService.controlAllLights(bridgeIp, username, state);
        
        // Update all lights state in memory
        if (dashboardState.hue && dashboardState.hue.lights) {
            dashboardState.hue.lights.forEach(light => {
                Object.assign(light, state);
            });
        }
        
        // Broadcast update to all connected clients
        io.emit('hueUpdated', dashboardState.hue);
        
        res.json({ success: true, message: 'All lights updated' });
        
    } catch (error) {
        console.error('❌ Failed to control all lights:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Discover bridge
router.get('/discover', async (req, res) => {
    try {
        const result = await hueService.discoverBridge();
        res.json(result);
    } catch (error) {
        console.error('❌ Bridge discovery failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Test connection
router.get('/test', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const bridgeIp = dashboardState.settings.hueBridgeIp;
        const username = dashboardState.settings.hueUsername;
        
        if (!bridgeIp) {
            return res.status(400).json({ error: 'No Hue bridge IP configured' });
        }
        
        if (!username) {
            return res.status(400).json({ error: 'No Hue username configured' });
        }
        
        const result = await hueService.testConnection(bridgeIp, username);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Hue test failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Hue settings endpoint
router.post('/settings', (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { hueBridgeIp, hueUsername } = req.body;
        
        if (hueBridgeIp) {
            // Validate IP format
            const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
            if (!ipRegex.test(hueBridgeIp.trim())) {
                return res.status(400).json({ error: 'Invalid IP address format' });
            }
            dashboardState.settings.hueBridgeIp = hueBridgeIp.trim();
            console.log('Hue bridge IP updated:', hueBridgeIp);
        }
        
        if (hueUsername) {
            const cleanUsername = hueUsername.trim();
            if (cleanUsername.length < 10) {
                return res.status(400).json({ error: 'Invalid username format' });
            }
            dashboardState.settings.hueUsername = cleanUsername;
            console.log('Hue username updated');
        }
        
        // Save settings to file
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change to all connected clients
        req.app.locals.io.emit('settingsUpdated', dashboardState);
        
        res.json({ 
            success: true, 
            settings: {
                hasBridgeIp: !!dashboardState.settings.hueBridgeIp,
                hasUsername: !!dashboardState.settings.hueUsername
            }
        });
        
    } catch (error) {
        console.error('Error updating Hue settings:', error);
        res.status(500).json({ error: 'Failed to update Hue settings' });
    }
});

// Preset scenes
router.post('/scenes/:scene', async (req, res) => {
    try {
        const { dashboardState, io } = req.app.locals;
        const bridgeIp = dashboardState.settings.hueBridgeIp;
        const username = dashboardState.settings.hueUsername;
        const scene = req.params.scene;
        
        if (!bridgeIp || !username) {
            return res.status(400).json({ error: 'Hue bridge not configured' });
        }

        let state = {};
        
        switch (scene) {
            case 'bright':
                state = { on: true, bri: 254, sat: 0, hue: 0 };
                break;
            case 'dim':
                state = { on: true, bri: 80, sat: 0, hue: 0 };
                break;
            case 'relax':
                state = { on: true, bri: 150, sat: 200, hue: 8000 };
                break;
            case 'energize':
                state = { on: true, bri: 254, sat: 200, hue: 46000 };
                break;
            case 'off':
                state = { on: false };
                break;
            default:
                return res.status(400).json({ error: 'Unknown scene' });
        }
        
        await hueService.controlAllLights(bridgeIp, username, state);
        
        // Update all lights state in memory
        if (dashboardState.hue && dashboardState.hue.lights) {
            dashboardState.hue.lights.forEach(light => {
                Object.assign(light, state);
            });
        }
        
        // Broadcast update to all connected clients
        io.emit('hueUpdated', dashboardState.hue);
        
        res.json({ success: true, message: `Applied ${scene} scene` });
        
    } catch (error) {
        console.error(`❌ Failed to apply scene ${req.params.scene}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;