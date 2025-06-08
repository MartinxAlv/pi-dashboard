const axios = require('axios');

class HueService {
    constructor() {
        this.discoveryUrl = 'https://discovery.meethue.com/';
        this.timeout = 10000;
    }

    // Discover Hue bridges on the network
    async discoverBridge() {
        try {
            console.log('🔍 Discovering Philips Hue bridges...');
            const response = await axios.get(this.discoveryUrl, { timeout: this.timeout });
            
            if (response.data && response.data.length > 0) {
                const bridge = response.data[0];
                console.log(`✅ Found Hue bridge: ${bridge.internalipaddress}`);
                return {
                    success: true,
                    bridgeIp: bridge.internalipaddress,
                    bridgeId: bridge.id
                };
            } else {
                return {
                    success: false,
                    error: 'No Hue bridges found on network'
                };
            }
        } catch (error) {
            console.error('❌ Bridge discovery failed:', error.message);
            return {
                success: false,
                error: 'Failed to discover Hue bridge: ' + error.message
            };
        }
    }

    // Test connection to bridge
    async testConnection(bridgeIp, username) {
        try {
            if (!bridgeIp || !username) {
                return {
                    success: false,
                    error: 'Bridge IP and username are required'
                };
            }

            const url = `http://${bridgeIp}/api/${username}/lights`;
            const response = await axios.get(url, { timeout: this.timeout });
            
            if (response.data && !response.data[0]?.error) {
                const lightCount = Object.keys(response.data).length;
                console.log(`✅ Hue connection successful: ${lightCount} lights found`);
                return {
                    success: true,
                    message: `Connected successfully`,
                    lightCount: lightCount
                };
            } else if (response.data[0]?.error) {
                return {
                    success: false,
                    error: response.data[0].error.description
                };
            }
        } catch (error) {
            console.error('❌ Hue connection test failed:', error.message);
            return {
                success: false,
                error: 'Connection failed: ' + error.message
            };
        }
    }

    // Get all lights
    async getLights(bridgeIp, username) {
        try {
            const url = `http://${bridgeIp}/api/${username}/lights`;
            const response = await axios.get(url, { timeout: this.timeout });
            
            if (response.data && !response.data[0]?.error) {
                const lights = Object.entries(response.data).map(([id, light]) => ({
                    id: parseInt(id),
                    name: light.name,
                    on: light.state.on,
                    brightness: light.state.bri || 0,
                    hue: light.state.hue || 0,
                    saturation: light.state.sat || 0,
                    colormode: light.state.colormode || 'hs',
                    reachable: light.state.reachable,
                    type: light.type,
                    modelid: light.modelid,
                    uniqueid: light.uniqueid
                }));
                
                return { success: true, lights };
            } else if (response.data[0]?.error) {
                throw new Error(response.data[0].error.description);
            }
        } catch (error) {
            console.error('❌ Failed to get lights:', error.message);
            throw error;
        }
    }

    // Control a specific light
    async controlLight(bridgeIp, username, lightId, state) {
        try {
            const url = `http://${bridgeIp}/api/${username}/lights/${lightId}/state`;
            const response = await axios.put(url, state, { timeout: this.timeout });
            
            if (response.data && response.data[0]?.success) {
                console.log(`✅ Light ${lightId} updated successfully`);
                return { success: true, response: response.data };
            } else if (response.data[0]?.error) {
                throw new Error(response.data[0].error.description);
            }
        } catch (error) {
            console.error(`❌ Failed to control light ${lightId}:`, error.message);
            throw error;
        }
    }

    // Control all lights
    async controlAllLights(bridgeIp, username, state) {
        try {
            const url = `http://${bridgeIp}/api/${username}/groups/0/action`;
            const response = await axios.put(url, state, { timeout: this.timeout });
            
            if (response.data && response.data[0]?.success) {
                console.log('✅ All lights updated successfully');
                return { success: true, response: response.data };
            } else if (response.data[0]?.error) {
                throw new Error(response.data[0].error.description);
            }
        } catch (error) {
            console.error('❌ Failed to control all lights:', error.message);
            throw error;
        }
    }

    // Get sample lights for when no bridge is configured
    getSampleLights() {
        return [
            {
                id: 1,
                name: 'Living Room',
                on: true,
                brightness: 180,
                hue: 8000,
                saturation: 140,
                colormode: 'hs',
                reachable: true,
                type: 'Extended color light',
                modelid: 'LCT015'
            },
            {
                id: 2,
                name: 'Bedroom',
                on: false,
                brightness: 120,
                hue: 25500,
                saturation: 200,
                colormode: 'hs',
                reachable: true,
                type: 'Extended color light',
                modelid: 'LCT015'
            },
            {
                id: 3,
                name: 'Kitchen',
                on: true,
                brightness: 254,
                hue: 0,
                saturation: 0,
                colormode: 'hs',
                reachable: true,
                type: 'Dimmable light',
                modelid: 'LWB010'
            }
        ];
    }

    // Helper method to convert RGB to Hue/Saturation
    rgbToHs(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return {
            hue: Math.round(h * 65535),
            sat: Math.round(s * 254)
        };
    }

    // Helper method to convert Hue/Saturation to RGB
    hsToRgb(hue, sat) {
        const h = hue / 65535;
        const s = sat / 254;
        const l = 0.5;

        function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        let r, g, b;
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
}

module.exports = HueService;