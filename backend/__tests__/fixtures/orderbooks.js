// Test fixtures for orderbook data

// Standard orderbook with good depth
const standardOrderbook = {
    bids: [
        { price: 0.60, size: 1000 },
        { price: 0.59, size: 2000 },
        { price: 0.58, size: 3000 },
        { price: 0.57, size: 4000 },
        { price: 0.56, size: 5000 }
    ],
    asks: [
        { price: 0.61, size: 1000 },
        { price: 0.62, size: 2000 },
        { price: 0.63, size: 3000 },
        { price: 0.64, size: 4000 },
        { price: 0.65, size: 5000 }
    ]
};

// Thin orderbook (low liquidity)
const thinOrderbook = {
    bids: [
        { price: 0.60, size: 100 },
        { price: 0.55, size: 50 }
    ],
    asks: [
        { price: 0.65, size: 100 },
        { price: 0.70, size: 50 }
    ]
};

// Empty orderbook
const emptyOrderbook = {
    bids: [],
    asks: []
};

// Orderbook with array format [price, size]
const arrayFormatOrderbook = {
    bids: [
        [0.60, 1000],
        [0.59, 2000],
        [0.58, 3000]
    ],
    asks: [
        [0.61, 1000],
        [0.62, 2000],
        [0.63, 3000]
    ]
};

// Orderbook with alternative field names
const alternativeFieldOrderbook = {
    bids: [
        { p: 0.60, s: 1000 },
        { p: 0.59, s: 2000 }
    ],
    asks: [
        { p: 0.61, amount: 1000 },
        { p: 0.62, amount: 2000 }
    ]
};

// Deep orderbook for liquidity impact testing
// Total bid depth: 50,000 (5 levels of 10,000)
// Total ask depth: 50,000 (5 levels of 10,000)
const deepOrderbook = {
    bids: [
        { price: 0.60, size: 10000 },
        { price: 0.59, size: 10000 },
        { price: 0.58, size: 10000 },
        { price: 0.57, size: 10000 },
        { price: 0.56, size: 10000 }
    ],
    asks: [
        { price: 0.61, size: 10000 },
        { price: 0.62, size: 10000 },
        { price: 0.63, size: 10000 },
        { price: 0.64, size: 10000 },
        { price: 0.65, size: 10000 }
    ]
};

// WebSocket book snapshot message format
const bookSnapshot = {
    event_type: 'book',
    asset_id: '0x123abc456def',
    bids: [
        { price: '0.60', size: '1000' },
        { price: '0.59', size: '2000' },
        { price: '0.58', size: '3000' }
    ],
    asks: [
        { price: '0.61', size: '1000' },
        { price: '0.62', size: '2000' },
        { price: '0.63', size: '3000' }
    ],
    timestamp: '1704067200000',
    hash: 'snapshot_hash_abc123'
};

// WebSocket price_change message format (array of changes)
const priceChangeMessages = [
    { asset_id: '0x123abc456def', price: '0.595', size: '500', side: 'BUY' },
    { asset_id: '0x123abc456def', price: '0.61', size: '0', side: 'SELL' },
    { asset_id: '0x123abc456def', price: '0.60', size: '1500', side: 'BUY' }
];

// Single price change for adding a new level
const priceChangeAdd = {
    asset_id: '0x123abc456def',
    price: '0.575',
    size: '750',
    side: 'BUY'
};

// Single price change for removing a level (size = 0)
const priceChangeRemove = {
    asset_id: '0x123abc456def',
    price: '0.60',
    size: '0',
    side: 'BUY'
};

// Price change with alternative field names
const priceChangeAltFields = {
    assetId: '0x123abc456def',
    price: '0.59',
    size: '800',
    side: 'BUY'
};

module.exports = {
    standardOrderbook,
    thinOrderbook,
    emptyOrderbook,
    arrayFormatOrderbook,
    alternativeFieldOrderbook,
    deepOrderbook,
    // WebSocket message fixtures
    bookSnapshot,
    priceChangeMessages,
    priceChangeAdd,
    priceChangeRemove,
    priceChangeAltFields
};
