// Prediction Engine
// Combines base probability with signal adjustments

const signalRegistry = require('../signals/registry');
const db = require('../../db');

// Signal age threshold for "active" signals (5 minutes)
const ACTIVE_SIGNAL_THRESHOLD_MS = 5 * 60 * 1000;

// Calculate adjusted probability based on signals
async function calculatePrediction(event, market) {
    const baseProbability = market.probability || 0.5;

    // Process signals
    const signals = await signalRegistry.processEvent(event, market);

    // Calculate total adjustment from all signals
    let totalAdjustment = 0;
    for (const signal of signals) {
        totalAdjustment += signal.adjustment || 0;
    }

    // Apply adjustment with bounds
    let adjustedProbability = baseProbability + totalAdjustment;
    adjustedProbability = Math.max(0.01, Math.min(0.99, adjustedProbability));

    // Calculate confidence based on signal quality
    const signalConfidences = signals.map(s => s.confidence || 0);
    const avgConfidence = signalConfidences.length > 0
        ? signalConfidences.reduce((a, b) => a + b, 0) / signalConfidences.length
        : 0;

    const prediction = {
        eventId: event.id,
        baseProbability,
        adjustedProbability,
        confidence: avgConfidence,
        adjustment: totalAdjustment,
        signalsSummary: {
            count: signals.length,
            types: signals.map(s => s.signalType),
            totalAdjustment
        }
    };

    // Save prediction
    await db.predictions.create(prediction);

    return prediction;
}

// Get or calculate prediction for an event
async function getPrediction(event, market) {
    // Check for recent prediction
    const existing = await db.predictions.getLatestByEventId(event.id);

    // If recent (< 5 minutes), return it
    if (existing) {
        const age = Date.now() - new Date(existing.calculatedAt).getTime();
        if (age < 5 * 60 * 1000) {
            return existing;
        }
    }

    // Calculate new prediction
    return calculatePrediction(event, market);
}

// Batch calculate predictions for multiple events
async function calculatePredictions(events, markets) {
    const predictions = {};

    for (const event of events) {
        const market = markets.find(m => m.id === event.id) || event;
        try {
            const prediction = await calculatePrediction(event, market);
            predictions[event.id] = prediction;
        } catch (error) {
            console.error(`Failed to calculate prediction for ${event.id}:`, error.message);
        }
    }

    return predictions;
}

// Process a real-time signal and update the prediction
async function processRealTimeSignal(signal, market) {
    const eventId = signal.eventId || market.id;

    // Get current prediction for the market/event
    const currentPrediction = await db.predictions.getLatestByEventId(eventId);

    // Use current adjusted probability or fall back to market probability
    const currentAdjusted = currentPrediction?.adjustedProbability
        || market.probability
        || 0.5;

    // Calculate adjustment based on signal
    // directionMultiplier: +1 for YES, -1 for NO
    const directionMultiplier = signal.direction === 'YES' ? 1 : (signal.direction === 'NO' ? -1 : 0);
    const adjustment = signal.confidence * signal.weight * directionMultiplier;

    // Update the adjusted probability with bounds
    const newAdjusted = Math.max(0.01, Math.min(0.99, currentAdjusted + adjustment));

    // Create new prediction record with updated probability
    const newPrediction = {
        eventId,
        baseProbability: currentPrediction?.baseProbability || market.probability || 0.5,
        adjustedProbability: newAdjusted,
        confidence: signal.confidence,
        adjustment,
        signalsSummary: {
            count: 1,
            types: [signal.signalType],
            totalAdjustment: adjustment
        },
        realTimeSignal: true
    };

    // Save prediction to DB
    await db.predictions.create(newPrediction);

    // Also save the signal to DB
    await db.signals.create({
        eventId,
        signalType: signal.signalType,
        severity: signal.severity || 'LOW',
        confidence: signal.confidence,
        direction: signal.direction,
        weight: signal.weight,
        adjustment,
        metadata: signal.metadata || {}
    });

    // Update linked articles with the new probability
    const articlesUpdated = await db.articles.updateProbability(eventId, newAdjusted);
    if (articlesUpdated > 0) {
        console.log(`[PredictionEngine] Updated probability for ${articlesUpdated} article(s) linked to event ${eventId}: ${newAdjusted.toFixed(4)}`);
    }

    return {
        previousProbability: currentAdjusted,
        newProbability: newAdjusted,
        adjustment,
        signal
    };
}

// Get all active (recent) signals for an event
async function getActiveSignals(eventId) {
    const allSignals = await db.signals.getByEventId(eventId);
    const now = Date.now();

    // Filter to only recent signals (within threshold)
    const activeSignals = allSignals.filter(signal => {
        const signalTime = new Date(signal.detectedAt).getTime();
        return (now - signalTime) < ACTIVE_SIGNAL_THRESHOLD_MS;
    });

    return activeSignals;
}

// Calculate total impact of all signals on prediction
async function getSignalImpact(eventId) {
    const activeSignals = await getActiveSignals(eventId);

    if (activeSignals.length === 0) {
        return {
            eventId,
            totalImpact: 0,
            signalCount: 0,
            signals: [],
            breakdown: {}
        };
    }

    // Calculate total adjustment from all active signals
    let totalImpact = 0;
    const breakdown = {};

    for (const signal of activeSignals) {
        const adjustment = signal.adjustment || 0;
        totalImpact += adjustment;

        // Group by signal type
        const type = signal.signalType;
        if (!breakdown[type]) {
            breakdown[type] = {
                count: 0,
                totalAdjustment: 0,
                avgConfidence: 0
            };
        }
        breakdown[type].count += 1;
        breakdown[type].totalAdjustment += adjustment;
        breakdown[type].avgConfidence += signal.confidence || 0;
    }

    // Calculate average confidences
    for (const type of Object.keys(breakdown)) {
        breakdown[type].avgConfidence /= breakdown[type].count;
    }

    return {
        eventId,
        totalImpact,
        signalCount: activeSignals.length,
        signals: activeSignals.map(s => ({
            type: s.signalType,
            direction: s.direction,
            confidence: s.confidence,
            adjustment: s.adjustment,
            detectedAt: s.detectedAt
        })),
        breakdown
    };
}

module.exports = {
    calculatePrediction,
    getPrediction,
    calculatePredictions,
    processRealTimeSignal,
    getActiveSignals,
    getSignalImpact
};
