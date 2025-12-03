function safeNumber(n, fallback = 0) {
    return isNaN(parseFloat(n)) ? fallback : parseFloat(n);
}

module.exports = { safeNumber };