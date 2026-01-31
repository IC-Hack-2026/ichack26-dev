// Polymarket CLOB WebSocket Client
// Handles real-time order book, price changes, and trade events

const EventEmitter = require('events');
const config = require('../../config');

// Try to use 'ws' package, fall back to native WebSocket if available
let WebSocket;
try {
    WebSocket = require('ws');
} catch (e) {
    // In Node.js 22+, WebSocket is available globally
    if (typeof globalThis.WebSocket !== 'undefined') {
        WebSocket = globalThis.WebSocket;
    } else {
        throw new Error('WebSocket not available. Please install the "ws" package: npm install ws');
    }
}

const WS_URL = config.polymarket.wsUrl;
const RECONNECT_ATTEMPTS = config.realtime.reconnectAttempts;
const HEARTBEAT_INTERVAL = config.realtime.heartbeatIntervalMs;
const RECONNECT_BASE_DELAY = config.realtime.reconnectDelayMs;
const RECONNECT_MAX_DELAY = config.realtime.reconnectDelayMs * 10; // Max 10x base delay

// Valid event types for subscriptions
const VALID_EVENTS = ['book', 'price_change', 'last_trade_price'];

/**
 * Polymarket CLOB WebSocket Client
 * Connects to Polymarket's WebSocket API for real-time market data
 */
class ClobWebSocketClient extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.subscriptions = new Map(); // assetId -> Set of event types
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.intentionalDisconnect = false;

        // Add default error handler to prevent unhandled error crashes
        this.on('error', (err) => {
            // Default handler - errors will be logged by actual listeners or here
            if (this.listenerCount('error') <= 1) {
                console.error('ClobWebSocket default error handler:', err.message || err.type || 'Unknown error');
            }
        });
    }

    /**
     * Connect to the WebSocket server
     * @returns {Promise<void>} Resolves when connected
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                resolve();
                return;
            }

            this.intentionalDisconnect = false;

            try {
                this.ws = new WebSocket(WS_URL);

                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this._startHeartbeat();
                    this._resubscribeAll();
                    this.emit('connected');
                    resolve();
                };

                this.ws.onclose = (event) => {
                    this._handleDisconnect(event);
                };

                this.ws.onerror = (error) => {
                    // Only emit error if there are listeners (prevent unhandled error crash)
                    if (this.listenerCount('error') > 0) {
                        this.emit('error', error);
                    } else {
                        console.error('ClobWebSocket: Connection error (no listeners):', error.message || error.type || 'Unknown error');
                    }
                    if (!this.isConnected) {
                        reject(new Error('WebSocket connection failed'));
                    }
                };

                this.ws.onmessage = (event) => {
                    this._handleMessage(event);
                };
            } catch (error) {
                this.emit('error', error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        this.intentionalDisconnect = true;
        this._stopHeartbeat();
        this._stopReconnect();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.emit('disconnected');
    }

    /**
     * Force reconnect to the WebSocket server
     * @returns {Promise<void>} Resolves when reconnected
     */
    async reconnect() {
        this.disconnect();
        this.intentionalDisconnect = false;
        this.reconnectAttempts = 0;
        return this.connect();
    }

    /**
     * Subscribe to events for a specific asset
     * @param {string} assetId - The asset/market ID to subscribe to
     * @param {string[]} events - Array of event types: 'book', 'price_change', 'last_trade_price'
     */
    subscribe(assetId, events = VALID_EVENTS) {
        if (!assetId) {
            throw new Error('assetId is required');
        }

        // Validate events
        const validEvents = events.filter(e => VALID_EVENTS.includes(e));
        if (validEvents.length === 0) {
            throw new Error(`Invalid events. Valid options: ${VALID_EVENTS.join(', ')}`);
        }

        // Store subscription
        if (!this.subscriptions.has(assetId)) {
            this.subscriptions.set(assetId, new Set());
        }
        validEvents.forEach(e => this.subscriptions.get(assetId).add(e));

        // Send subscription messages if connected
        if (this.isConnected && this.ws) {
            this._sendSubscriptions(assetId, validEvents);
        }
    }

    /**
     * Unsubscribe from all events for a specific asset
     * @param {string} assetId - The asset/market ID to unsubscribe from
     */
    unsubscribe(assetId) {
        if (!assetId) {
            throw new Error('assetId is required');
        }

        const events = this.subscriptions.get(assetId);
        if (!events) {
            return;
        }

        // Send unsubscribe messages if connected
        if (this.isConnected && this.ws) {
            events.forEach(eventType => {
                this._send({
                    type: eventType,
                    action: 'unsubscribe',
                    assets_ids: [assetId]
                });
            });
        }

        this.subscriptions.delete(assetId);
    }

    /**
     * Get current subscription status
     * @returns {Object} Map of assetId to subscribed events
     */
    getSubscriptions() {
        const result = {};
        this.subscriptions.forEach((events, assetId) => {
            result[assetId] = Array.from(events);
        });
        return result;
    }

    /**
     * Check if currently connected
     * @returns {boolean}
     */
    isConnectedStatus() {
        return this.isConnected;
    }

    // Private methods

    _send(data) {
        if (this.ws && this.isConnected) {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            this.ws.send(message);
        }
    }

    _sendSubscriptions(assetId, events) {
        events.forEach(eventType => {
            this._send({
                type: eventType,
                action: 'subscribe',
                assets_ids: [assetId]
            });
        });
    }

    _resubscribeAll() {
        this.subscriptions.forEach((events, assetId) => {
            this._sendSubscriptions(assetId, Array.from(events));
        });
    }

    _handleMessage(event) {
        // Log ALL raw WebSocket messages
        console.log('[WS Raw]', event.data);

        try {
            // Handle non-JSON messages (e.g., "INVALID OPERATION")
            if (typeof event.data === 'string' && !event.data.startsWith('{') && !event.data.startsWith('[')) {
                // Skip known non-JSON responses silently
                return;
            }

            const data = JSON.parse(event.data);

            // Handle different message types
            if (data.type === 'book' || data.event_type === 'book') {
                this.emit('book', data);
            } else if (data.type === 'price_change' || data.event_type === 'price_change') {
                this.emit('price_change', data);
            } else if (data.type === 'last_trade_price' || data.event_type === 'last_trade_price') {
                this.emit('last_trade_price', data);
            } else if (data.type === 'pong') {
                // Heartbeat response - ignore
            } else {
                // Unknown message type, emit as generic event
                this.emit('message', data);
            }
        } catch (error) {
            // Only log parse errors for messages that look like they should be JSON
            if (event.data?.startsWith('{') || event.data?.startsWith('[')) {
                this.emit('error', new Error(`Failed to parse WebSocket message: ${error.message}`));
            }
        }
    }

    _handleDisconnect(event) {
        this.isConnected = false;
        this._stopHeartbeat();
        this.emit('disconnected', event);

        // Attempt reconnect if not intentional
        if (!this.intentionalDisconnect) {
            this._scheduleReconnect();
        }
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= RECONNECT_ATTEMPTS) {
            this.emit('error', new Error(`Max reconnection attempts (${RECONNECT_ATTEMPTS}) reached`));
            return;
        }

        // Exponential backoff with jitter
        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
            RECONNECT_MAX_DELAY
        );

        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                // Connection failed, will retry via _handleDisconnect
            }
        }, delay);
    }

    _stopReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    _startHeartbeat() {
        this._stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.ws) {
                this._send({ type: 'ping' });
            }
        }, HEARTBEAT_INTERVAL);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}

// Create singleton instance
const clobWebSocketClient = new ClobWebSocketClient();

// Export both the class and singleton instance
module.exports = {
    ClobWebSocketClient,
    clobWebSocketClient
};
