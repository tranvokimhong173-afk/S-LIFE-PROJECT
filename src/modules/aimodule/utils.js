function normalizeData(data) {
    return {
        bpm: data.bpm || 0,
        temp: data.temp || 0,
        fall: data.fall || { status: "Không rõ" },
    };
}

module.exports = { normalizeData };