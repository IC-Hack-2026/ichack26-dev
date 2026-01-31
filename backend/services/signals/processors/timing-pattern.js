// Timing Pattern Signal Processor
// Detects unusual trade concentration before market resolution

const BaseProcessor = require('../base-processor');
const db = require('../../../db/index.js');
const config = require('../../../config/index.js');

class TimingPatternProcessor extends BaseProcessor {
    constructor() {
        super('timing-pattern', config.signals.timingPattern.weight);
        this.windowHours = config.signals.timingPattern.windowHours;
        this.concentrationThreshold = config.signals.timingPattern.concentrationThreshold;
    }

    async process(event, market) {
        // Check if market has endDate/resolutionDate
        const resolutionDate = market.endDate || market.resolutionDate;
        if (!resolutionDate) {
            return { detected: false, confidence: 0, direction: null, metadata: {} };
        }

        // Calculate hours to resolution
        const now = new Date();
        const resolution = new Date(resolutionDate);
        const hoursToResolution = (resolution - now) / (1000 * 60 * 60);

        // If hoursToResolution > windowHours, return not detected
        if (hoursToResolution > this.windowHours) {
            return { detected: false, confidence: 0, direction: null, metadata: {} };
        }

        // Get trades from db
        const trades = await db.tradeHistory.getByMarket(market.tokenId);

        // Calculate trade concentration
        const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
        const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

        // Trades in last 6 hours
        const tradesLast6h = trades.filter(t => {
            const tradeTime = new Date(t.timestamp || t.recordedAt);
            return tradeTime >= sixHoursAgo;
        }).length;

        // Trades from 6-24 hours ago
        const tradesPrev18h = trades.filter(t => {
            const tradeTime = new Date(t.timestamp || t.recordedAt);
            return tradeTime >= twentyFourHoursAgo && tradeTime < sixHoursAgo;
        }).length;

        // Calculate concentration ratio
        // Avoid division by zero
        const rateRecent = tradesLast6h / 6;
        const ratePrevious = tradesPrev18h / 18;
        const concentrationRatio = ratePrevious > 0 ? rateRecent / ratePrevious : (tradesLast6h > 0 ? Infinity : 0);

        // Determine dominant side from recent trades (last 6 hours)
        const recentTrades = trades.filter(t => {
            const tradeTime = new Date(t.timestamp || t.recordedAt);
            return tradeTime >= sixHoursAgo;
        });

        let yesVolume = 0;
        let noVolume = 0;
        for (const trade of recentTrades) {
            const volume = trade.size || trade.amount || trade.volume || 0;
            const side = (trade.side || trade.outcome || '').toUpperCase();
            if (side === 'YES' || side === 'BUY') {
                yesVolume += volume;
            } else if (side === 'NO' || side === 'SELL') {
                noVolume += volume;
            }
        }
        const dominantSide = yesVolume >= noVolume ? 'YES' : 'NO';

        // Check if concentration exceeds threshold and within window
        if (concentrationRatio > this.concentrationThreshold && hoursToResolution < this.windowHours) {
            const confidence = Math.min(concentrationRatio / 5, 1);
            const severity = concentrationRatio > 4 ? 'HIGH' : 'MEDIUM';

            return {
                detected: true,
                confidence,
                direction: dominantSide,
                severity,
                metadata: {
                    concentrationRatio,
                    tradesLast6h,
                    tradesPrev18h,
                    hoursToResolution,
                    dominantSide
                }
            };
        }

        return { detected: false, confidence: 0, direction: null, metadata: {} };
    }
}

// Export both class and singleton instance
const timingPatternProcessor = new TimingPatternProcessor();

module.exports = TimingPatternProcessor;
module.exports.TimingPatternProcessor = TimingPatternProcessor;
module.exports.timingPatternProcessor = timingPatternProcessor;
