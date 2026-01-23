// Debug flag - set to false to disable debug output
const DEBUG = true;

/**
 * Parses a CSV text into an array of objects, handling quoted fields and auto-detecting delimiter (comma or tab).
 * @param {string} csvText - The raw CSV text from the file.
 * @returns {Array<Object>} Array of player objects with keys matching column headers.
 */
function parseCsvToObjects(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
        return [];
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
    for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i], delimiter);
        if (fields.length === headers.length) {
            const player = {};
            headers.forEach((header, index) => {
                player[header] = fields[index];
            });
            // Convert numeric fields
            player['General Speedups'] = parseFloat(player['General Speedups']) || 0;
            player['Soldier Training'] = parseFloat(player['Soldier Training']) || 0;
            player['Construction'] = parseFloat(player['Construction']) || 0;
            player['Research'] = parseFloat(player['Research']) || 0;
            player['TrueGold Pieces'] = parseFloat(player['TrueGold Pieces']) || 0;
             // Parse availableTimeRanges from 'All Times'
             player.availableTimeRanges = parseTimeRanges(player['All Times']);
             // Union with overall time window
             const overallRanges = parseTimeRanges(`${player['Time Slot Start UTC']}-${player['Time Slot End UTC']}`);
             player.availableTimeRanges = unionTimeRanges(overallRanges.concat(player.availableTimeRanges));
             players.push(player);
        }
    }
    return players;
}

/**
 * Parses the 'All Times' field into an array of time range objects.
 * Handles raw hours (e.g., "19" -> "19:00"), clamps hours to 0-23 using modulo 24,
 * and splits overnight ranges (start >= end) into two: start to 23:59 and 00:00 to end.
 * @param {string} allTimes - Comma-separated time ranges, e.g., "00:00-12:00,19-2".
 * @returns {Array<Object>} Array of {start: string, end: string} in HH:MM format.
 */
function parseTimeRanges(allTimes) {
    console.log('Parsing time ranges from:', allTimes);
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
        console.log(`Parsed range: ${range} -> ${parts} -> start: ${start} (${startMin}), end: ${end} (${endMin})`);
        if (startMin < endMin) {
            ranges.push({ start, end });
        } else {
            ranges.push({ start, end: '23:59' });
            ranges.push({ start: '00:00', end });
        }
    });
    console.log('Parsed time ranges:', allTimes,ranges);
    return ranges;
}

/**
 * Unions an array of time range objects by removing exact duplicates and sorting.
 * Does not merge overlapping or adjacent ranges.
 * @param {Array<Object>} ranges - Array of {start: string, end: string} in HH:MM format.
 * @returns {Array<Object>} Deduplicated and sorted array of {start: string, end: string}.
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
 * Allocates general speedups to the specified categories based on the 'General Used For' field.
 * If 2 categories: 60/40 split (first category gets 60%).
 * If 3 or none: even split.
 * @param {Object} player - The player object to modify.
 */
function allocateGeneralSpeedups(player) {
    const usedFor = player['General Used For'].split(',').map(s => s.trim());
    const numCategories = usedFor.length;
    const speedups = player['General Speedups'];
    if (numCategories === 0) {
        // No categories, do nothing or even split? But user said "if three or none, allocate with an even split" – but none might mean all?
        // Assume even split to all three if none specified.
        const split = speedups / 3;
        player['Soldier Training'] += split;
        player['Construction'] += split;
        player['Research'] += split;
    } else if (numCategories === 2) {
        const split60 = speedups * 0.6;
        const split40 = speedups * 0.4;
        const firstCat = usedFor[0];
        const secondCat = usedFor[1];
        if (firstCat === 'Soldier Training') player['Soldier Training'] += split60;
        else if (firstCat === 'Construction') player['Construction'] += split60;
        else if (firstCat === 'Research') player['Research'] += split60;
        if (secondCat === 'Soldier Training') player['Soldier Training'] += split40;
        else if (secondCat === 'Construction') player['Construction'] += split40;
        else if (secondCat === 'Research') player['Research'] += split40;
    } else {
        const split = speedups / numCategories;
        usedFor.forEach(cat => {
            if (cat === 'Soldier Training') player['Soldier Training'] += split;
            else if (cat === 'Construction') player['Construction'] += split;
            else if (cat === 'Research') player['Research'] += split;
        });
    }
}

/**
 * Creates the minister list: players sorted by the maximum of construction or research speedups (descending).
 * @param {Array<Object>} players - Array of player objects.
 * @returns {Array<Object>} Sorted minister list.
 */
function createMinisterList(players) {
    return players.slice().sort((a, b) => {
        const aMax = Math.max(a['Construction'], a['Research']);
        const bMax = Math.max(b['Construction'], b['Research']);
        return bMax - aMax;
    });
}

/**
 * Creates the advisor list: players sorted by soldier training speedups (descending).
 * @param {Array<Object>} players - Array of player objects.
 * @returns {Array<Object>} Sorted advisor list.
 */
function createAdvisorList(players) {
    return players.slice().sort((a, b) => b['Soldier Training'] - a['Soldier Training']);
}

/**
 * Generates an array of half-hour time slots for a day (00:00 to 23:30 UTC).
 * @returns {Array<Object>} Array of {start: string, end: string} in HH:MM format.
 */
function generateTimeSlots() {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            const start = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const endMinute = minute + 30;
            const endHour = hour + Math.floor(endMinute / 60);
            const endMin = endMinute % 60;
            const end = `${(endHour % 24).toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
            slots.push({ start, end });
        }
    }
    return slots;
}

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
 * Checks if a time slot is available for a player based on their time ranges and overall window.
 * Handles crossing slots (e.g., 23:30-00:00) by checking late-night and early-morning availability.
 * @param {Object} player - The player object.
 * @param {string} slotStart - Slot start time HH:MM.
 * @param {string} slotEnd - Slot end time HH:MM.
 * @returns {boolean} True if the slot is available.
 */
function isSlotAvailable(player, slotStart, slotEnd) {
    const slotStartMin = timeToMinutes(slotStart);
    const slotEndMin = timeToMinutes(slotEnd);
    const overallStart = timeToMinutes(player['Time Slot Start UTC']);
    const overallEnd = timeToMinutes(player['Time Slot End UTC']);

    // Check overall window (for crossing slots, endMin might be 0, handle accordingly)
    const adjustedSlotEndMin = slotEndMin < slotStartMin ? slotEndMin + 1440 : slotEndMin;
    const adjustedOverallEnd = overallEnd < overallStart ? overallEnd + 1440 : overallEnd;
    if (slotStartMin < overallStart || adjustedSlotEndMin > adjustedOverallEnd) {
        return false;
    }

    // If no specific ranges, overall is sufficient
    if (player.availableTimeRanges.length === 0) {
        return true;
    }

    // Check if slot fits within any range
    if (slotEndMin > slotStartMin) {
        // Normal slot
        return player.availableTimeRanges.some(range => {
            const rangeStartMin = timeToMinutes(range.start);
            const rangeEndMin = timeToMinutes(range.end);
            return slotStartMin >= rangeStartMin && slotEndMin <= rangeEndMin;
        });
    } else {
        // Crossing slot: check late-night (slotStart to 23:59) and early-morning (00:00 to slotEnd)
        const hasLate = player.availableTimeRanges.some(range => {
            const rangeStartMin = timeToMinutes(range.start);
            const rangeEndMin = timeToMinutes(range.end);
            return slotStartMin >= rangeStartMin && rangeEndMin >= slotStartMin;
        });
        const hasEarly = player.availableTimeRanges.some(range => {
            const rangeStartMin = timeToMinutes(range.start);
            const rangeEndMin = timeToMinutes(range.end);
            return rangeStartMin <= 0 && slotEndMin <= rangeEndMin;
        });
        return hasLate && hasEarly;
    }
}

/**
 * Schedules appointments for a specific day and role, assigning players to earliest available slots.
 * @param {Array<Object>} playerList - Sorted list of players for the role.
 * @param {number} day - The day number (1,2,4,5).
 * @param {string} role - 'minister' or 'advisor'.
 * @param {Object} playerAssignments - Map of player IDs to assignment status.
 * @param {Object} assignments - Object to store assigned slots per day.
 * @param {Array} waiting - Array to collect waiting players.
 */
function scheduleForDay(playerList, day, role, playerAssignments, assignments, waiting) {
    const slots = generateTimeSlots();
    const taken = new Set(); // Set of start times taken
    for (const player of playerList) {
        const playerId = `${player.Player}-${player.Alliance}`;
        if (playerAssignments[playerId][role + 'Assigned']) {
            continue; // Already assigned this role
        }
        let assigned = false;
        for (const slot of slots) {
            if (!taken.has(slot.start) && isSlotAvailable(player, slot.start, slot.end)) {
                assignments[day].push({
                    start: slot.start,
                    end: slot.end,
                    alliance: player.Alliance,
                    player: player.Player
                });
                taken.add(slot.start);
                playerAssignments[playerId][role + 'Assigned'] = true;
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            waiting.push({ alliance: player.Alliance, player: player.Player });
        }
    }
}

/**
 * Updates the schedule tables and waiting list in the UI.
 * @param {Object} assignments - Object with day keys and arrays of appointment objects.
 * @param {Array} waiting - Array of waiting player objects.
 */
function updateScheduleTables(assignments, waiting) {
    [1, 2, 4, 5].forEach(day => {
        assignments[day].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        populateTable(`day${day}Table`, assignments[day]);
    });
    populateWaitingList(waiting);
}

/**
 * Populates a table with appointment data.
 * @param {string} tableId - The ID of the table element.
 * @param {Array<Object>} appointments - Array of appointment objects {start, end, alliance, player}.
 */
function populateTable(tableId, appointments) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    appointments.forEach(app => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = app.start;
        row.insertCell(1).textContent = app.end;
        row.insertCell(2).textContent = `${app.alliance}/${app.player}`;
    });
}

/**
 * Populates the waiting list.
 * @param {Array<Object>} waiting - Array of waiting player objects {alliance, player}.
 */
function populateWaitingList(waiting) {
    const ul = document.getElementById('waitingList');
    ul.innerHTML = '';
    if (waiting.length === 0) {
        ul.innerHTML = '<li>No players waiting.</li>';
    } else {
        waiting.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.alliance}/${player.player}`;
            ul.appendChild(li);
        });
    }
}

/**
 * Populates the filtered users list.
 * @param {Array<Object>} filteredOut - Array of filtered-out player objects.
 */
function updateFilteredList(filteredOut) {
    const section = document.getElementById('filteredUsersSection');
    const list = document.getElementById('filteredUsersList');
    if (filteredOut.length > 0) {
        list.innerHTML = '';
        filteredOut.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.Alliance}/${player.Player}`;
            list.appendChild(li);
        });
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

/**
 * Populates the debug table with player time slots if DEBUG is true.
 * Dynamically creates and inserts the debug section before Day 1.
 * @param {Array<Object>} players - Array of player objects.
 */
function populateDebugTable(players) {
    if (!DEBUG) return;

    const debugDiv = document.createElement('div');
    debugDiv.className = 'day-section debug-section';
    debugDiv.innerHTML = `
        <h2>Debug: Player Time Slots (before Day 1 scheduling)</h2>
        <table id="debugTable" class="table table-striped">
            <thead>
                <tr>
                    <th>Player/Alliance</th>
                    <th>Time Slots</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;

    const tbody = debugDiv.querySelector('#debugTable tbody');
    players.forEach(player => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = `${player.Alliance}/${player.Player}`;
        const timeSlots = player.availableTimeRanges.length > 0
            ? player.availableTimeRanges.map(range => `${range.start}-${range.end}`).join(', ')
            : 'No available ranges';
        row.insertCell(1).textContent = timeSlots;
    });

    const day1Section = document.getElementById('day1Section');
    day1Section.parentNode.insertBefore(debugDiv, day1Section);
}

/**
 * Processes players, allocates speedups, filters, creates lists, and schedules appointments.
 * @param {Array<Object>} players - Array of player objects from CSV.
 * @param {number} minHours - Minimum hours required for construction+research or training.
 */
function processAndSchedule(players, minHours) {
    // Allocate general speedups
    players.forEach(allocateGeneralSpeedups);

    // Filter players based on minimum hours
    const filtered = players.filter(player => (player['Construction'] + player['Research'] >= minHours) || (player['Soldier Training'] >= minHours));
    const filteredOut = players.filter(player => !filtered.includes(player));

    // Create lists from filtered players
    const ministerList = createMinisterList(filtered);
    const advisorList = createAdvisorList(filtered);

    // Debug: Show player time slots before Day 1 scheduling
    populateDebugTable(players);

    // Initialize assignments and tracking
    const assignments = { 1: [], 2: [], 4: [], 5: [] };
    const playerAssignments = {};
    filtered.forEach(player => {
        const playerId = `${player.Player}-${player.Alliance}`;
        playerAssignments[playerId] = { ministerAssigned: false, advisorAssigned: false };
    });
    const waiting = [];

    // Schedule minister for days 1,2,5
    [1, 2, 5].forEach(day => {
        scheduleForDay(ministerList, day, 'minister', playerAssignments, assignments, waiting);
    });

    // Schedule advisor for day 4
    scheduleForDay(advisorList, 4, 'advisor', playerAssignments, assignments, waiting);

     // Update UI
     updateScheduleTables(assignments, waiting);
     updateFilteredList(filteredOut);
     document.querySelectorAll('.day-section').forEach(el => el.style.display = 'block');
     document.getElementById('day1Section').scrollIntoView({ behavior: 'smooth', block: 'start' });
     document.getElementById('loadingIndicator').style.display = 'none';
}

// Event listener for file input
document.getElementById('csvFileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('loadingIndicator').style.display = 'block';
        const reader = new FileReader();
        reader.onload = function(e) {
            const csvText = e.target.result;
            const players = parseCsvToObjects(csvText);
            const minHours = parseInt(document.getElementById('minHoursInput').value) || 20;
            // Process and schedule
            processAndSchedule(players, minHours);
        };
        reader.readAsText(file);
    }
});