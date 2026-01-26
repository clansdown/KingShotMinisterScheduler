/**
 * @typedef {Object} PlayerObject
 * @property {string} player - Player's name.
 * @property {string} alliance - Player's alliance name.
 * @property {number} [generalSpeedups] - Number of general speedups (converted to number).
 * @property {string} [generalUsedFor] - Comma-separated categories for general speedups.
 * @property {number} soldierTraining - Base soldier training speedups (converted to number).
 * @property {number} construction - Base construction speedups (converted to number).
 * @property {number} research - Base research speedups (converted to number).
 * @property {number} truegoldPieces - Number of TrueGold pieces (converted to number).
 * @property {string} timeSlotStartUtc - Overall start time in HH:MM.
 * @property {string} timeSlotEndUtc - Overall end time in HH:MM.
 * @property {string} [allTimes] - Available time ranges string.
 * @property {Array<TimeRange>} availableTimeRanges - Parsed available time ranges.
 */

/**
 * @typedef {Object} TimeRange
 * @property {string} start - Start time in HH:MM format.
 * @property {string} end - End time in HH:MM format.
 */

// Constants for CSV field names (normalized to lowercase)
const PLAYER = 'player';
const ALLIANCE = 'alliance';
const GENERAL_SPEEDUPS = 'general speedups';
const GENERAL_USED_FOR = 'general used for';
const SOLDIER_TRAINING = 'soldier training';
const CONSTRUCTION = 'construction';
const RESEARCH = 'research';
const TRUEGOLD_PIECES = 'truegold pieces';
const TIME_SLOT_START_UTC = 'time slot start utc';
const TIME_SLOT_END_UTC = 'time slot end utc';
const ALL_TIMES = 'all times';

/**
 * Converts a time string HH:MM to minutes since midnight.
 * @param {string} time - Time in HH:MM format.
 * @returns {number} Minutes since midnight.
 */
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Normalizes a time string to HH:MM format, clamping hours to 0-23.
 * @param {string} timeStr - Time string, e.g., "19" or "19:30".
 * @returns {string} Normalized time in HH:MM format.
 */
function normalizeTime(timeStr) {
    let [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    h = Math.max(0, Math.min(23, h)); // Clamp to 0-23
    m = Math.max(0, Math.min(59, m)); // Clamp minutes to 0-59
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Unions an array of time range objects by removing exact duplicates and sorting.
 * Does not merge overlapping or adjacent ranges.
 * @param {Array<TimeRange>} ranges - Array of time range objects.
 * @returns {Array<TimeRange>} Deduplicated and sorted array of time range objects.
 */
function unionTimeRanges(ranges) {
    const seen = new Set();
    const unique = [];
    ranges.forEach(range => {
        const key = `${range.start}-${range.end}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(range);
        }
    });
    unique.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    return unique;
}

/**
 * Parses the 'All Times' field into an array of time range objects.
 * Handles raw hours (e.g., "19" -> "19:00"), clamps hours to 0-23 using modulo 24,
 * and splits overnight ranges (start >= end) into two: start to 23:59 and 00:00 to end,
 * unless the end is exactly 00:00, in which case it's treated as a single range to 23:59.
 * @param {string} allTimes - Comma-separated time ranges, e.g., "00:00-12:00,19-2".
 * @returns {Array<TimeRange>} Array of time range objects.
 */
function parseTimeRanges(allTimes) {
    if (!allTimes) {
        return [];
    }
    const cleaned = allTimes.replace(/\s*(or|and|&)\s*/gi, ',').replace(/\//g, ','); // Replace delimiters and / with comma
    const stripped = cleaned.replace(/[^0-9:,\-]/g, ''); // Strip invalid characters
    const ranges = [];
    stripped.split(',').forEach(range => {
        const parts = range.split('-');
        if (parts.length !== 2) return; // Skip invalid ranges
        const start = normalizeTime(parts[0]);
        const end = normalizeTime(parts[1]);
        const startMin = timeToMinutes(start);
        const endMin = timeToMinutes(end);
        if (startMin < endMin) {
            ranges.push({ start, end });
        } else {
            ranges.push({ start, end: '23:59' });
            if (end !== '00:00') {
                ranges.push({ start: '00:00', end });
            }
        }
    });
    return ranges;
}

/**
 * Parses a CSV text into an array of objects, handling quoted fields and auto-detecting delimiter (comma or tab).
 * @param {string} csvText - The raw CSV text from the file.
 * @returns {{players: Array<PlayerObject>, errors: Array<string>}} Object containing array of player objects and array of error strings.
 */
function parseCsvToObjects(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
        return { players: [], errors: [] };
    }

    // Auto-detect delimiter based on first line
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter = commaCount >= tabCount ? ',' : '\t';

    /**
     * Parses a single CSV line into fields, respecting quoted values.
     * @param {string} line - The line to parse.
     * @param {string} delimiter - The field delimiter.
     * @returns {Array<string>} Array of field values.
     */
    function parseCsvLine(line, delimiter) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip the next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                fields.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current);
        return fields.map(field => field.trim());
    }

    const headers = parseCsvLine(firstLine, delimiter);
    const players = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i], delimiter);
        const lineNumber = i + 1; // 1-based line number for user (header is line 1)
        const rawLine = lines[i];

        if (fields.length < headers.length) {
            errors.push(`Line ${lineNumber}: Field count mismatch - expected at least ${headers.length} fields, got ${fields.length}. Raw line: "${rawLine}"`);
            continue;
        }

        const player = {};
        let lineHasError = false;

        headers.forEach((header, index) => {
            if (index < fields.length) {
                player[header.toLowerCase().trim()] = fields[index];
            }
        });

        // Convert numeric fields and validate
        const numericFields = [GENERAL_SPEEDUPS, SOLDIER_TRAINING, CONSTRUCTION, RESEARCH, TRUEGOLD_PIECES];
        numericFields.forEach(field => {
            const val = parseFloat(player[field]);
            if (isNaN(val)) {
                 if (player[field] && isNaN(parseFloat(player[field]))) {
                     errors.push(`Line ${lineNumber}: Invalid number in '${field}' field: "${player[field]}". Raw line: "${rawLine}"`);
                     lineHasError = true;
                 }
            }
            player[field] = parseFloat(player[field]) || 0;
        });

        if (lineHasError) continue;

        try {
            // Parse availableTimeRanges from 'All Times'
            player.availableTimeRanges = parseTimeRanges(player[ALL_TIMES]);
            
            // Validate time slot start/end format if present
            const start = player[TIME_SLOT_START_UTC];
            const end = player[TIME_SLOT_END_UTC];
            if (start && !/^\d{1,2}(:\d{2})?$/.test(start)) {
                 throw new Error(`Invalid format for '${TIME_SLOT_START_UTC}': "${start}"`);
            }
            if (end && !/^\d{1,2}(:\d{2})?$/.test(end)) {
                 throw new Error(`Invalid format for '${TIME_SLOT_END_UTC}': "${end}"`);
            }

            // Union with overall time window
            const overallRanges = parseTimeRanges(`${player[TIME_SLOT_START_UTC]}-${player[TIME_SLOT_END_UTC]}`);
            player.availableTimeRanges = unionTimeRanges(overallRanges.concat(player.availableTimeRanges));
            players.push(player);
        } catch (e) {
            errors.push(`Line ${lineNumber}: Time parsing error - ${e.message}. Raw line: "${rawLine}"`);
        }
    }
    return { players, errors };
}
