// Prediction Engine
// Combines base probability with signal adjustments

const signalRegistry = require('../signals/registry');
const db = require('../../db');

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

module.exports = {
    calculatePrediction,
    getPrediction,
    calculatePredictions
};
