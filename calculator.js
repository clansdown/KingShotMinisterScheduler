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
            players.push(player);
        }
    }
    return players;
}

/**
 * Parses the 'All Times' field into an array of time range objects.
 * @param {string} allTimes - Comma-separated time ranges, e.g., "00:00-12:00,18:00-23:59".
 * @returns {Array<Object>} Array of {start: string, end: string} in HH:MM format.
 */
function parseTimeRanges(allTimes) {
    if (!allTimes) {
        return [];
    }
    const stripped = allTimes.replace(/\s/g, ''); // Strip whitespace
    return stripped.split(',').map(range => {
        const parts = range.split('-');
        return { start: parts[0], end: parts[1] };
    });
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

    // Check overall window
    if (slotStartMin < overallStart || slotEndMin > overallEnd) {
        return false;
    }

    // If no specific ranges, overall is sufficient
    if (player.availableTimeRanges.length === 0) {
        return true;
    }

    // Check if slot fits within any range
    return player.availableTimeRanges.some(range => {
        const rangeStartMin = timeToMinutes(range.start);
        const rangeEndMin = timeToMinutes(range.end);
        return slotStartMin >= rangeStartMin && slotEndMin <= rangeEndMin;
    });
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
 * Processes players, allocates speedups, creates lists, and schedules appointments.
 * @param {Array<Object>} players - Array of player objects from CSV.
 */
function processAndSchedule(players) {
    // Allocate general speedups
    players.forEach(allocateGeneralSpeedups);

    // Create lists
    const ministerList = createMinisterList(players);
    const advisorList = createAdvisorList(players);

    // Initialize assignments and tracking
    const assignments = { 1: [], 2: [], 4: [], 5: [] };
    const playerAssignments = {};
    players.forEach(player => {
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
            // Process and schedule
            processAndSchedule(players);
        };
        reader.readAsText(file);
    }
});