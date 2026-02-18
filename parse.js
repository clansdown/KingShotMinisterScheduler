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
 * Extracts and normalizes a time string to HH:MM format, handling am/pm.
 * @param {string} timeStr - Time string, e.g., "19", "19:30", "2am", "9pm".
 * @returns {string} Normalized time in HH:MM format, or null if invalid.
 */
function extractTimeWithAmPm(timeStr) {
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?(?:am|pm|AM|PM)?/i);
    if (!match) return null;

    let h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3] ? match[3].toLowerCase() : null;

    // Handle am/pm (assume 24h unless specified)
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;

    // Treat 24 as midnight (00:00)
    if (h === 24) h = 0;
    h = Math.max(0, Math.min(23, h));
    const clampedM = Math.max(0, Math.min(59, m));

    return `${h.toString().padStart(2, '0')}:${clampedM.toString().padStart(2, '0')}`;
}

/**
 * Normalizes a time string to HH:MM format, clamping hours to 0-23.
 * Used by calculator.js for form input normalization.
 * @param {string} timeStr - Time string, e.g., "19" or "19:30".
 * @returns {string} Normalized time in HH:MM format.
 */
function normalizeTime(timeStr) {
    if (!timeStr) return '00:00';
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
 * Handles raw hours (e.g., "19" -> "19:00"), am/pm notation, and splits overnight ranges.
 * Uses sequential time extraction: if a range delimiter is found between times, treats as range;
 * otherwise treats each time as a single-hour slot. Overnight ranges (start >= end) are split
 * into two ranges at midnight, unless end is exactly midnight (00:00).
 * @param {string} allTimes - Time availability string, e.g., "00:00-12:00,19-2" or "19 to 22".
 * @returns {Array<TimeRange>} Array of time range objects.
 */
function parseTimeRanges(allTimes) {
    if (!allTimes) {
        return [];
    }

    // Regex patterns
    const TIME_PATTERN = /(\d{1,2})(?::(\d{2}))?(?:am|pm|AM|PM)?/gi;
    const RANGE_DELIMITER = /\s*(?:[-–—]|(?:to|till|until|through|thru)(?:\s+times?)?)\s*/gi;

    // Remove common noise words that are not range or section delimiters
    const cleaned = allTimes.replace(/(?:at|from|between|start(?:ing)?|end(?:ing)?|hours|avail(?:ability)?|free|can\s+play)\s*/gi, '');

    // Find all time matches with their positions
    /** @type {Array<{index: number, timeStr: string, normalized: string}>} */
    const timeMatches = [];
    let match;
    const timeRegex = new RegExp(TIME_PATTERN);
    while ((match = timeRegex.exec(cleaned)) !== null) {
        const normalized = extractTimeWithAmPm(match[0]);
        if (normalized) {
            timeMatches.push({
                index: match.index,
                timeStr: match[0],
                normalized: normalized
            });
        }
    }

    if (timeMatches.length === 0) {
        return [];
    }

    const ranges = [];
    let i = 0;

    while (i < timeMatches.length) {
        const startTime = timeMatches[i].normalized;
        const startIndex = timeMatches[i].index;
        const startEndIndex = startIndex + timeMatches[i].timeStr.length;

        // Check if there's a next time
        if (i + 1 < timeMatches.length) {
            const nextTime = timeMatches[i + 1];
            const textBetween = cleaned.substring(startEndIndex, nextTime.index);

            // Check if there's a range delimiter between current and next time
            RANGE_DELIMITER.lastIndex = 0;
            const delimiterMatch = RANGE_DELIMITER.exec(textBetween);

            if (delimiterMatch) {
                // Range mode: next time is the end of the range
                const endTime = nextTime.normalized;
                addRangeIfValid(ranges, startTime, endTime);
                i += 2; // Skip to next pair after the range
                continue;
            }
        }

        // Single hour mode: treat as hour-long slot starting at this time
        const hour = parseInt(startTime.split(':')[0], 10);
        const endHour = (hour + 1) % 24;
        const endTime = `${endHour.toString().padStart(2, '0')}:00`;
        addRangeIfValid(ranges, startTime, endTime);
        i++;
    }

    return ranges;
}

/**
 * Adds a time range to the array, handling overnight ranges by splitting at midnight.
 * If end is exactly midnight (00:00), does not split (treats as single range to midnight).
 * @param {Array<TimeRange>} ranges - Array to push the range to.
 * @param {string} start - Start time in HH:MM.
 * @param {string} end - End time in HH:MM.
 */
function addRangeIfValid(ranges, start, end) {
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);

    // Same start and end = invalid, skip
    if (startMin === endMin) {
        return;
    }

    // Within same day
    if (startMin < endMin) {
        ranges.push({ start, end });
    } else {
        // Overnight range - split at midnight
        ranges.push({ start, end: '23:59' });
        // Only add second part if end is not midnight
        if (end !== '00:00') {
            ranges.push({ start: '00:00', end });
        }
    }
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
            const originalVal = player[field].trim();
            const lowerVal = originalVal.toLowerCase();
            if (lowerVal === 'na' || lowerVal === 'n/a') {
                player[field] = 0;
                return;
            }
            const val = parseFloat(originalVal);
            if (isNaN(val)) {
                 if (originalVal) {
                      errors.push(`Line ${lineNumber}: Invalid number in '${field}' field: "${originalVal}". Raw line: "${rawLine}"`);
                      lineHasError = true;
                 }
            }
            player[field] = val || 0;
        });

        if (lineHasError) continue;

        try {
            const start = player[TIME_SLOT_START_UTC];
            const end = player[TIME_SLOT_END_UTC];
            const allTimes = player[ALL_TIMES];

            // Validate time slot start/end format if present
            if (start && !/^\d{1,2}(:\d{2})?$/.test(start)) {
                 throw new Error(`Invalid format for '${TIME_SLOT_START_UTC}': "${start}"`);
            }
            if (end && !/^\d{1,2}(:\d{2})?$/.test(end)) {
                 throw new Error(`Invalid format for '${TIME_SLOT_END_UTC}': "${end}"`);
            }

            // Determine presence of inputs
            const startPresent = start !== undefined && start !== '' && start !== null;
            const endPresent = end !== undefined && end !== '' && end !== null;
            const hasTimeSlots = startPresent && endPresent;
            const hasAllTimes = allTimes !== undefined && allTimes !== '' && allTimes !== null;

            // Validate: start/end must both be present or both absent
            if (startPresent !== endPresent) {
                throw new Error(`Must provide both '${TIME_SLOT_START_UTC}' and '${TIME_SLOT_END_UTC}' together, or omit both`);
            }

            // Validate: either time slots or all times must be present
            if (!hasTimeSlots && !hasAllTimes) {
                throw new Error(`Must provide '${ALL_TIMES}' (or both '${TIME_SLOT_START_UTC}' and '${TIME_SLOT_END_UTC}' for backwards compatibility)`);
            }

            // Parse availableTimeRanges based on presence of inputs
            if (hasTimeSlots && hasAllTimes) {
                const timeSlotRanges = parseTimeRanges(`${start}-${end}`);
                const allTimesRanges = parseTimeRanges(allTimes);
                player.availableTimeRanges = unionTimeRanges(timeSlotRanges.concat(allTimesRanges));
            } else if (hasTimeSlots) {
                player.availableTimeRanges = parseTimeRanges(`${start}-${end}`);
            } else {
                player.availableTimeRanges = parseTimeRanges(allTimes);
            }

            players.push(player);
        } catch (e) {
            errors.push(`Line ${lineNumber}: Time parsing error - ${e.message}. Raw line: "${rawLine}"`);
        }
    }
    return { players, errors };
}
