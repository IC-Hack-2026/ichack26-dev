// Prediction Engine
// Returns base probability (whale adjustments are handled separately by ProbabilityAdjuster)

const db = require('../../db');

// Calculate prediction using base probability only
// Whale trade adjustments are handled by ProbabilityAdjuster in real-time
async function calculatePrediction(event, market) {
    const baseProbability = market.probability || 0.5;

    const prediction = {
        eventId: event.id,
        baseProbability,
        adjustedProbability: baseProbability,
        confidence: 1,
        adjustment: 0,
        signalsSummary: { count: 0, types: [], totalAdjustment: 0 }
    };

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
