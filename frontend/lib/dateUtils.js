export function formatRelativeDate(dateString) {
    if (!dateString) return null;

    const now = new Date();
    const target = new Date(dateString);

    // Normalize to start of day for calendar comparison
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((targetStart - todayStart) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return 'Within a week';
    if (diffDays <= 30) return 'Within a month';
    if (diffDays <= 90) return 'Within 3 months';
    return 'Later this year';
}
