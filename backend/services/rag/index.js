// RAG Service Entry Point
// Retrieval-Augmented Generation for finding related news

const { findRelatedNews, extractSearchQuery } = require('./newsSearch');

module.exports = {
    findRelatedNews,
    extractSearchQuery
};
