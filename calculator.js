// Debug flag - set to false to disable debug output
const DEBUG = true;

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

/**
 * @typedef {Object} Appointment
 * @property {string} start - Slot start time in HH:MM.
 * @property {string} end - Slot end time in HH:MM.
 * @property {string} alliance - Player's alliance.
 * @property {string} player - Player's name.
 * @property {string|number} speedups - Speedup info (string for ministers, number for advisors).
 * @property {number} truegold - TrueGold pieces.
 */

/**
 * @typedef {Object} PlayerAssignments
 * @property {Object<string, {ministerAssigned: boolean, advisorAssigned: boolean}>} - Keys are player IDs (alliance/player), values are assignment status.
 */

/**
 * @typedef {Object} Assignments
 * @property {Object<number, {ministers: Array<Appointment>, advisors: Array<Appointment>}>} - Keys are day numbers (1,2,4,5), values are role-specific appointment arrays.
 */

/**
 * @typedef {Object} WaitingPlayer
 * @property {string} alliance - Player's alliance.
 * @property {string} player - Player's name.
 * @property {{soldier: number, construction: number, research: number}} speedups - Post-distribution speedups.
 * @property {number} truegold - TrueGold pieces.
 * @property {string} timeSlots - Comma-separated time ranges or 'No available ranges'.
 */

/**
 * @typedef {Object} SchedulerData
 * @property {Array<PlayerObject>} rawPlayers - The initial parsed data from the CSV file, before any processing.
 * @property {Array<PlayerObject>} processedPlayers - The player data after distributing general speedups.
 * @property {Assignments} assignments - The generated schedule assignments.
 * @property {Object<string, {ministerAssigned: boolean, advisorAssigned: boolean}>} playerAssignments - Tracking of assigned players.
 * @property {Array<WaitingPlayer>} waitingList - List of players who could not be assigned.
 * @property {Array<PlayerObject>} filteredOut - List of players filtered out due to insufficient hours.
 * @property {number} minHours - The minimum hours threshold used for processing.
 * @property {number} creationTimeMS - Creation timestamp in epoch milliseconds.
 * @property {number} lastModifiedTimeMS - Last modification timestamp in epoch milliseconds.
 * @property {number} constructionKingDay - The day construction speedups are king-prioritized (default 1).
 * @property {number} researchKingDay - The day research speedups are king-prioritized (default 2).
 */

/**
 * Global object to hold all application data.
 * @type {SchedulerData}
 */
const schedulerData = {
    rawPlayers: [],
    processedPlayers: [],
    assignments: { 1: {ministers: [], advisors: []}, 2: {ministers: [], advisors: []}, 3: {ministers: [], advisors: []}, 4: {ministers: [], advisors: []}, 5: {ministers: [], advisors: []} },
    waitingList: [],
    filteredOut: [],
    playerAssignments: {},
    minHours: 20,
    creationTimeMS: 0,
    lastModifiedTimeMS: 0,
    constructionKingDay: 1,
    researchKingDay: 2
};

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

// Constants for categories in 'General Used For'
const CATEGORY_SOLDIER_TRAINING = 'soldier training';
const CATEGORY_CONSTRUCTION = 'construction';
const CATEGORY_RESEARCH = 'research';

/**
 * Parses a CSV text into an array of objects, handling quoted fields and auto-detecting delimiter (comma or tab).
 * @param {string} csvText - The raw CSV text from the file.
 * @returns {Array<PlayerObject>} Array of player objects with fields matching CSV headers, including parsed time ranges.
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
                player[header.toLowerCase().trim()] = fields[index];
            });
            // Convert numeric fields
            player[GENERAL_SPEEDUPS] = parseFloat(player[GENERAL_SPEEDUPS]) || 0;
            player[SOLDIER_TRAINING] = parseFloat(player[SOLDIER_TRAINING]) || 0;
            player[CONSTRUCTION] = parseFloat(player[CONSTRUCTION]) || 0;
            player[RESEARCH] = parseFloat(player[RESEARCH]) || 0;
            player[TRUEGOLD_PIECES] = parseFloat(player[TRUEGOLD_PIECES]) || 0;
              // Parse availableTimeRanges from 'All Times'
              player.availableTimeRanges = parseTimeRanges(player[ALL_TIMES]);
              // Union with overall time window
              const overallRanges = parseTimeRanges(`${player[TIME_SLOT_START_UTC]}-${player[TIME_SLOT_END_UTC]}`);
              player.availableTimeRanges = unionTimeRanges(overallRanges.concat(player.availableTimeRanges));
              players.push(player);
        }
    }
    return players;
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
 * @param {PlayerObject} player - The player object to modify in-place.
 */
function allocateGeneralSpeedups(player) {
    let usedFor = player[GENERAL_USED_FOR].split(',').map(s => s.trim().toLowerCase());
    usedFor = usedFor.map(s => s === 'training' ? 'soldier training' : s);
    usedFor = usedFor.filter(s => s !== '');
    const numCategories = usedFor.length;
    const speedups = player[GENERAL_SPEEDUPS];
    if (numCategories === 0) {
        // No categories, do nothing or even split? But user said "if three or none, allocate with an even split" – but none might mean all?
        // Assume even split to all three if none specified.
        const split = speedups / 3;
        player[SOLDIER_TRAINING] += split;
        player[CONSTRUCTION] += split;
        player[RESEARCH] += split;
    } else if (numCategories === 2) {
        const split60 = speedups * 0.6;
        const split40 = speedups * 0.4;
        const firstCat = usedFor[0];
        const secondCat = usedFor[1];
        if (firstCat === CATEGORY_SOLDIER_TRAINING) player[SOLDIER_TRAINING] += split60;
        else if (firstCat === CATEGORY_CONSTRUCTION) player[CONSTRUCTION] += split60;
        else if (firstCat === CATEGORY_RESEARCH) player[RESEARCH] += split60;
        if (secondCat === CATEGORY_SOLDIER_TRAINING) player[SOLDIER_TRAINING] += split40;
        else if (secondCat === CATEGORY_CONSTRUCTION) player[CONSTRUCTION] += split40;
        else if (secondCat === CATEGORY_RESEARCH) player[RESEARCH] += split40;
    } else {
        const split = speedups / numCategories;
        usedFor.forEach(cat => {
            if (cat === CATEGORY_SOLDIER_TRAINING) player[SOLDIER_TRAINING] += split;
            else if (cat === CATEGORY_CONSTRUCTION) player[CONSTRUCTION] += split;
            else if (cat === CATEGORY_RESEARCH) player[RESEARCH] += split;
        });
    }
}

/**
 * Creates the minister list: players sorted by the sum of construction and research speedups (descending).
 * @param {Array<PlayerObject>} players - Array of player objects.
 * @returns {Array<PlayerObject>} Sorted minister list.
 */
function createMinisterList(players) {
    return players.slice().sort((a, b) => {
        return (b[CONSTRUCTION] + b[RESEARCH]) - (a[CONSTRUCTION] + a[RESEARCH]);
    });
}

/**
 * Creates the advisor list: players sorted by soldier training speedups (descending).
 * @param {Array<PlayerObject>} players - Array of player objects.
 * @returns {Array<PlayerObject>} Sorted advisor list.
 */
function createAdvisorList(players) {
    return players.slice().sort((a, b) => b[SOLDIER_TRAINING] - a[SOLDIER_TRAINING]);
}

/**
 * Generates an array of half-hour time slots for a day (00:00 to 23:30 UTC).
 * @returns {Array<TimeRange>} Array of time range objects.
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
 * @param {PlayerObject} player - The player object.
 * @param {string} slotStart - Slot start time in HH:MM.
 * @param {string} slotEnd - Slot end time in HH:MM.
 * @returns {boolean} True if the slot is available.
 */
function isSlotAvailable(player, slotStart, slotEnd) {
    const slotStartMin = timeToMinutes(slotStart);
    const slotEndMin = timeToMinutes(slotEnd);
    const overallStart = timeToMinutes(player[TIME_SLOT_START_UTC]);
    const overallEnd = timeToMinutes(player[TIME_SLOT_END_UTC]);

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
 * Schedules Noble Advisors for Day 4, with overflow to Chief Ministers if no advisor slot is available.
 * Players are processed in order of highest to lowest soldier training hours.
 * @param {Array<PlayerObject>} playerList - List of players qualified for Noble Advisor (sorted by soldier training descending).
 * @param {number} minHours - Minimum soldier training hours required for Noble Advisor qualification.
 * @param {PlayerAssignments} playerAssignments - Object tracking each player's assignment status.
 * @param {Assignments} assignments - Object containing assignment arrays for each day and role.
 * @param {Array<WaitingPlayer>} waiting - Array to add players who cannot be assigned to either role.
 * @param {number} day - The day number (expected to be 4).
 */
function scheduleNobleAdvisors(playerList, minHours, playerAssignments, assignments, waitingList, day) {
    // Sort players by training hours descending (highest first)
    playerList.sort((a, b) => b.soldierTraining - a.soldierTraining);

    // Generate independent slot arrays for advisors and ministers
    const advisorSlots = generateTimeSlots();
    const ministerSlots = generateTimeSlots();

    // Independent taken sets for advisor and minister slots
    const takenAdvisorSlots = new Set();
    const takenMinisterSlots = new Set();

    // Iterate through the sorted players
    for (const player of playerList) {
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        if (playerAssignments[playerId].advisorAssigned) {
            continue; // Already assigned as advisor (including via overflow)
        }
        // Check advisor qualification
        if (player[SOLDIER_TRAINING] < minHours) {
            continue;
        }
        let assigned = false;

        // Attempt Noble Advisor assignment
        for (const slot of advisorSlots) {
            if (!takenAdvisorSlots.has(slot.start) && isSlotAvailable(player, slot.start, slot.end)) {
                assignments[day].advisors.push({
                    start: slot.start,
                    end: slot.end,
                    alliance: player[ALLIANCE],
                    player: player[PLAYER],
                    speedups: Math.round(player[SOLDIER_TRAINING]),
                    truegold: player[TRUEGOLD_PIECES]
                });
                takenAdvisorSlots.add(slot.start);
                playerAssignments[playerId].advisorAssigned = true;
                assigned = true;
                break;
            }
        }

        // Attempt Chief Minister overflow
        if (!assigned) {
            for (const slot of ministerSlots) {
                if (!takenMinisterSlots.has(slot.start) && isSlotAvailable(player, slot.start, slot.end)) {
                    assignments[day].ministers.push({
                        start: slot.start,
                        end: slot.end,
                        alliance: player[ALLIANCE],
                        player: player[PLAYER],
                        speedups: `${Math.round(player[CONSTRUCTION])} / ${Math.round(player[RESEARCH])}`,
                        truegold: player[TRUEGOLD_PIECES]
                    });
                    takenMinisterSlots.add(slot.start);
                    playerAssignments[playerId].advisorAssigned = true; // Counts as advisor assignment
                    assigned = true;
                    break;
                }
            }
        }

        // Handle unassigned players
        if (!assigned) {
            waitingList.push({
                alliance: player[ALLIANCE],
                player: player[PLAYER],
                speedups: {
                    soldier: Math.round(player[SOLDIER_TRAINING]),
                    construction: Math.round(player[CONSTRUCTION]),
                    research: Math.round(player[RESEARCH])
                },
                truegold: Math.round(player[TRUEGOLD_PIECES]),
                timeSlots: player.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ') || 'No available ranges'
            });
        }
    }
}

/**
 * Updates the schedule tables and waiting list in the UI.
 * @param {Assignments} assignments - Object with day keys and role-specific appointment arrays.
 * @param {Array<WaitingPlayer>} waiting - Array of waiting player objects.
 */
function updateScheduleTables(assignments, waiting) {
    const days = [1, 2, 3, 4, 5];
    days.forEach(day => {
        assignments[day].ministers.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        populateTable(`day${day}MinisterTable`, assignments[day].ministers);
        if (day !== 3) {
            assignments[day].advisors.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
            populateTable(`day${day}NobleTable`, assignments[day].advisors);
            // Hide second table section if empty
            const secondSectionId = day === 4 ? `day${day}MinisterSection` : `day${day}NobleSection`;
            const secondAppointments = day === 4 ? assignments[day].ministers : assignments[day].advisors;
            if (secondAppointments.length === 0) {
                document.getElementById(secondSectionId).style.display = 'none';
            }
        }
    });
    populateWaitingList(waiting);
}

/**
 * Populates a table with appointment data.
 * @param {string} tableId - The ID of the table element.
 * @param {Array<Appointment>} appointments - Array of appointment objects.
 */
function populateTable(tableId, appointments) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    if (appointments.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell(0);
        cell.textContent = 'No appointments.';
        cell.colSpan = tableId.includes('Noble') ? 4 : 5; // Updated colspan for extra action column
    } else {
        const dayMatch = tableId.match(/day(\d+)/);
        const day = dayMatch ? parseInt(dayMatch[1]) : 0;
        const role = tableId.includes('Minister') ? 'ministers' : 'advisors';

        appointments.forEach(app => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = `${app.start}–${app.end}`;
            row.insertCell(1).textContent = `${app.alliance}/${app.player}`;
            row.insertCell(2).textContent = app.speedups;
            if (!tableId.includes('Noble')) {
                row.insertCell(3).textContent = app.truegold;
            }
            
            // Actions Column
            const actionsCell = row.insertCell(tableId.includes('Noble') ? 3 : 4);
            
            // Reassign Button
            const reassignBtn = document.createElement('button');
            reassignBtn.className = 'btn btn-sm btn-outline-primary me-1';
            reassignBtn.textContent = '🔃';
            reassignBtn.onclick = () => openAssignmentModal(app.alliance, app.player, {
                day: day,
                role: role,
                existingSlotStart: app.start,
                existingSlotEnd: app.end
            });
            actionsCell.appendChild(reassignBtn);
            
            // Remove Button (X)
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger';
            removeBtn.innerHTML = '&#10060;'; // Unicode X
            removeBtn.title = 'Remove Assignment';
            removeBtn.onclick = () => removeAssignment(day, role, app.start, app.alliance, app.player);
            actionsCell.appendChild(removeBtn);
        });
    }

    // Update header to add "Actions" column if not already there
    const thead = document.querySelector(`#${tableId} thead tr`);
    if (thead && !thead.lastElementChild.textContent.includes('Actions')) {
        const th = document.createElement('th');
        th.textContent = 'Actions';
        thead.appendChild(th);
    }
}

/**
 * Populates the waiting list.
 * @param {Array<WaitingPlayer>} waiting - Array of waiting player objects.
 */
function populateWaitingList(waiting) {
    const ol = document.getElementById('waitingList');
    ol.innerHTML = '';
    if (waiting.length === 0) {
        ol.innerHTML = '<li>No players waiting.</li>';
    } else {
        waiting.forEach(player => {
            const li = document.createElement('li');
            li.className = 'mb-2';
            li.textContent = `${player.alliance}/${player.player} - Speedups: T:${player.speedups.soldier} C:${player.speedups.construction} R:${player.speedups.research} - TrueGold: ${player.truegold} - Time Slots: ${player.timeSlots} `;
            
            // Assign Button
            const assignBtn = document.createElement('button');
            assignBtn.className = 'btn btn-sm btn-success ms-2';
            assignBtn.textContent = 'Assign';
            assignBtn.onclick = () => openAssignmentModal(player.alliance, player.player);
            li.appendChild(assignBtn);
            
            ol.appendChild(li);
        });
    }
}

/**
 * Populates the filtered users list.
 * @param {Array<PlayerObject>} filteredOut - Array of filtered-out player objects.
 */
function updateFilteredList(filteredOut) {
    const section = document.getElementById('filteredUsersSection');
    const ol = document.getElementById('filteredUsersList');
    if (filteredOut.length > 0) {
        ol.innerHTML = '';
        filteredOut.forEach(player => {
            const li = document.createElement('li');
            li.className = 'mb-2';
            // @ts-ignore
            li.textContent = `${player[ALLIANCE]}/${player[PLAYER]} - Speedups: T:${Math.round(player[SOLDIER_TRAINING])} C:${Math.round(player[CONSTRUCTION])} R:${Math.round(player[RESEARCH])} - TrueGold: ${Math.round(player[TRUEGOLD_PIECES])} `;
            
            // Assign Button
            const assignBtn = document.createElement('button');
            assignBtn.className = 'btn btn-sm btn-success ms-2';
            assignBtn.textContent = 'Assign';
            // @ts-ignore
            assignBtn.onclick = () => openAssignmentModal(player[ALLIANCE], player[PLAYER]);
            li.appendChild(assignBtn);
            
            ol.appendChild(li);
        });
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

/**
 * Populates the debug table with player time slots if DEBUG is true.
 * Targets the existing #playerInfoSection div in HTML.
 * @param {Array<PlayerObject>} players - Array of player objects.
 */
function populateDebugTable(players) {
    if (!DEBUG) return;

    const section = document.getElementById('playerInfoSection');
    if (!section) {
        console.error('Player info section not found');
        return;
    }
    section.innerHTML = `
        <div class="row mb-2">
            <div class="col">
                <h2>Player Information</h2>
            </div>
            <div class="col text-end">
                <button class="btn btn-sm btn-outline-secondary" type="button" id="toggleDebugTable" onclick="toggleTable('debugTable')">Expand</button>
            </div>
        </div>
        <table id="debugTable" class="table table-striped w-100" style="display: none;">
            <thead>
                <tr>
                    <th>Player/Alliance</th>
                    <th>General</th>
                    <th>General Used For</th>
                    <th>Training</th>
                    <th>Construction</th>
                    <th>Research</th>
                    <th>TrueGold</th>
                    <th>Time Slots</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;

    // Set initial visibility based on localStorage
    const button = document.getElementById('toggleDebugTable');
    const table = document.getElementById('debugTable');
    const isVisible = localStorage.getItem('debugTableVisible') === 'true';
    if (isVisible) {
        table.style.display = '';
        button.textContent = 'Collapse';
    } else {
        table.style.display = 'none';
        button.textContent = 'Expand';
        localStorage.setItem('debugTableVisible', 'false');
    }

    const tbody = section.querySelector('#debugTable tbody');
    const sortedPlayers = players.slice().sort((a, b) => {
        const aStr = `${a[ALLIANCE]}/${a[PLAYER]}`;
        const bStr = `${b[ALLIANCE]}/${b[PLAYER]}`;
        return aStr.localeCompare(bStr, undefined, { sensitivity: 'base' });
    });
    sortedPlayers.forEach(player => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = `${player[ALLIANCE]}/${player[PLAYER]}`;
        row.insertCell(1).textContent = Math.round(player[GENERAL_SPEEDUPS]);
        row.insertCell(2).textContent = player[GENERAL_USED_FOR];
        row.insertCell(3).textContent = Math.round(player[SOLDIER_TRAINING]);
        row.insertCell(4).textContent = Math.round(player[CONSTRUCTION]);
        row.insertCell(5).textContent = Math.round(player[RESEARCH]);
        row.insertCell(6).textContent = Math.round(player[TRUEGOLD_PIECES]);
        const timeSlots = player.availableTimeRanges.length > 0
            ? player.availableTimeRanges.map(range => `${range.start}-${range.end}`).join(', ')
            : 'No available ranges';
        row.insertCell(7).textContent = timeSlots;
    });

    section.style.display = 'block';
}

/**
 * Calculates the schedule and updates the global schedulerData object.
 * @param {Array<PlayerObject>} players - Array of player objects from CSV.
 * @param {number} minHours - Minimum hours required for construction+research or training.
 */
function calculateScheduleData(players) {
    const minHours = parseInt(document.getElementById('minHoursInput').value) || 20;
    const constructDay = parseInt(document.getElementById('constructionKingDay').value) || 1;
    const researchDay = parseInt(document.getElementById('researchKingDay').value) || 2;
    const now = Date.now();
    schedulerData.creationTimeMS = now;
    schedulerData.lastModifiedTimeMS = now;
    schedulerData.minHours = minHours;
    schedulerData.constructionKingDay = constructDay;
    schedulerData.researchKingDay = researchDay;
    schedulerData.rawPlayers = JSON.parse(JSON.stringify(players));
    schedulerData.processedPlayers = players; // In-place modification will happen on this array

    // Allocate general speedups
    schedulerData.processedPlayers.forEach(allocateGeneralSpeedups);

    // Filter players based on minimum hours
    const filtered = schedulerData.processedPlayers.filter(player => (player[CONSTRUCTION] + player[RESEARCH] >= minHours) || (player[SOLDIER_TRAINING] >= minHours));
    schedulerData.filteredOut = schedulerData.processedPlayers.filter(player => !filtered.includes(player));

    // Initialize assignments and tracking
    schedulerData.assignments = { 1: {ministers: [], advisors: []}, 2: {ministers: [], advisors: []}, 3: {ministers: [], advisors: []}, 4: {ministers: [], advisors: []}, 5: {ministers: [], advisors: []} };
    schedulerData.playerAssignments = {};
    filtered.forEach(player => {
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        schedulerData.playerAssignments[playerId] = { ministerAssigned: false, advisorAssigned: false };
    });
    const tempWaitingList = [];

    // Construction buff assignment
    const constructionList = filtered.filter(player => player[CONSTRUCTION] >= minHours).sort((a, b) => b[CONSTRUCTION] - a[CONSTRUCTION]);
    for (const player of constructionList) {
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        if (schedulerData.playerAssignments[playerId].ministerAssigned) {
            continue;
        }
        const taken = new Set(schedulerData.assignments[constructDay].ministers.map(a => a.start));
        const slots = generateTimeSlots();
        for (const slot of slots) {
            if (!taken.has(slot.start) && isSlotAvailable(player, slot.start, slot.end)) {
                schedulerData.assignments[constructDay].ministers.push({
                    start: slot.start,
                    end: slot.end,
                    alliance: player[ALLIANCE],
                    player: player[PLAYER],
                    speedups: `${Math.round(player[CONSTRUCTION])}`,
                    truegold: player[TRUEGOLD_PIECES]
                });
                taken.add(slot.start);
                schedulerData.playerAssignments[playerId].ministerAssigned = true;
                break;
            }
        }
    }
    tempWaitingList.push(...constructionList.filter(player => !schedulerData.playerAssignments[`${player[PLAYER]}-${player[ALLIANCE]}`].ministerAssigned).map(player => ({
        alliance: player[ALLIANCE],
        player: player[PLAYER],
        speedups: {
            soldier: Math.round(player[SOLDIER_TRAINING]),
            construction: Math.round(player[CONSTRUCTION]),
            research: Math.round(player[RESEARCH])
        },
        truegold: Math.round(player[TRUEGOLD_PIECES]),
        timeSlots: player.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ') || 'No available ranges'
    })));

    // Research buff assignment
    const researchList = filtered.filter(player => player[RESEARCH] >= minHours).sort((a, b) => b[RESEARCH] - a[RESEARCH]);
    for (const player of researchList) {
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        if (schedulerData.playerAssignments[playerId].ministerAssigned) {
            continue;
        }
        const taken = new Set(schedulerData.assignments[researchDay].ministers.map(a => a.start));
        const slots = generateTimeSlots();
        for (const slot of slots) {
            if (!taken.has(slot.start) && isSlotAvailable(player, slot.start, slot.end)) {
                schedulerData.assignments[researchDay].ministers.push({
                    start: slot.start,
                    end: slot.end,
                    alliance: player[ALLIANCE],
                    player: player[PLAYER],
                    speedups: `${Math.round(player[RESEARCH])}`,
                    truegold: player[TRUEGOLD_PIECES]
                });
                taken.add(slot.start);
                schedulerData.playerAssignments[playerId].ministerAssigned = true;
                break;
            }
        }
    }
    tempWaitingList.push(...researchList.filter(player => !schedulerData.playerAssignments[`${player[PLAYER]}-${player[ALLIANCE]}`].ministerAssigned).map(player => ({
        alliance: player[ALLIANCE],
        player: player[PLAYER],
        speedups: {
            soldier: Math.round(player[SOLDIER_TRAINING]),
            construction: Math.round(player[CONSTRUCTION]),
            research: Math.round(player[RESEARCH])
        },
        truegold: Math.round(player[TRUEGOLD_PIECES]),
        timeSlots: player.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ') || 'No available ranges'
    })));

    // Advisor assignment for Day 4 with vector tempWaitingList vector
    const advisorList = createAdvisorList(filtered.filter(player => player[SOLDIER_TRAINING] >= minHours));
    scheduleNobleAdvisors(advisorList, minHours, schedulerData.playerAssignments, schedulerData.assignments, tempWaitingList, 4);

    // Consolidate waiting list
    const consolidatedWaitingList = [];
    const seenPlayers = new Map();
    tempWaitingList.forEach(waitingPlayer => {
        const key = `${waitingPlayer.alliance}/${waitingPlayer.player}`;
        if (!seenPlayers.has(key)) {
            seenPlayers.set(key, waitingPlayer);
        }
    });
    consolidatedWaitingList.push(...seenPlayers.values());

    // Assign consolidated WL to open CM slots on days 1,2,5
    for (const waitingPlayer of consolidatedWaitingList.slice()) {
        const playerId = `${waitingPlayer.player}-${waitingPlayer.alliance}`;
        if (schedulerData.playerAssignments[playerId]?.ministerAssigned) {
            consolidatedWaitingList.splice(consolidatedWaitingList.indexOf(waitingPlayer), 1);
            continue;
        }
        const daysToTry = [1, 2, 5];
        for (const day of daysToTry) {
            const taken = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
            const slots = generateTimeSlots();
            const player = filtered.find(p => p[PLAYER] === waitingPlayer.player && p[ALLIANCE] === waitingPlayer.alliance);
            for (const slot of slots) {
                if (!taken.has(slot.start) && player && isSlotAvailable(player, slot.start, slot.end)) {
                    schedulerData.assignments[day].ministers.push({
                        start: slot.start,
                        end: slot.end,
                        alliance: waitingPlayer.alliance,
                        player: waitingPlayer.player,
                        speedups: `${Math.round(waitingPlayer.speedups.construction)} / ${Math.round(waitingPlayer.speedups.research)}`,
                        truegold: waitingPlayer.truegold
                    });
                    schedulerData.playerAssignments[playerId].ministerAssigned = true;
                    consolidatedWaitingList.splice(consolidatedWaitingList.indexOf(waitingPlayer), 1);
                    break;
                }
            }
            if (schedulerData.playerAssignments[playerId]?.ministerAssigned) {
                break;
            }
        }
    }

    // Assign remaining WL to days 3 and 4 (CM-only)
    for (const waitingPlayer of consolidatedWaitingList.slice()) {
        const playerId = `${waitingPlayer.player}-${waitingPlayer.alliance}`;
        if (schedulerData.playerAssignments[playerId]?.ministerAssigned) {
            consolidatedWaitingList.splice(consolidatedWaitingList.indexOf(waitingPlayer), 1);
            continue;
        }
        const daysToTry = [3, 4];
        for (const day of daysToTry) {
            const taken = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
            const slots = generateTimeSlots();
            const player = filtered.find(p => p[PLAYER] === waitingPlayer.player && p[ALLIANCE] === waitingPlayer.alliance);
            for (const slot of slots) {
                if (!taken.has(slot.start) && player && isSlotAvailable(player, slot.start, slot.end)) {
                    schedulerData.assignments[day].ministers.push({
                        start: slot.start,
                        end: slot.end,
                        alliance: waitingPlayer.alliance,
                        player: waitingPlayer.player,
                        speedups: `${Math.round(waitingPlayer.speedups.construction)} / ${Math.round(waitingPlayer.speedups.research)}`,
                        truegold: waitingPlayer.truegold
                    });
                    schedulerData.playerAssignments[playerId].ministerAssigned = true;
                    consolidatedWaitingList.splice(consolidatedWaitingList.indexOf(waitingPlayer), 1);
                    break;
                }
            }
            if (schedulerData.playerAssignments[playerId]?.ministerAssigned) {
                break;
            }
        }
    }

    // Set global waiting list
    schedulerData.waitingList = consolidatedWaitingList;
}

/**
 * Renders the UI based on the provided scheduler data.
 * @param {SchedulerData} data - The data to render.
 * @param {boolean} [scrollToTop=false] - Whether to scroll to the top of Day 1 section.
 */
function renderUI(data, scrollToTop = false) {
    populateDebugTable(data.processedPlayers);
    updateScheduleTables(data.assignments, data.waitingList);
    updateFilteredList(data.filteredOut);
    document.querySelectorAll('.day-section').forEach(el => el.style.display = 'block');
    if (scrollToTop) {
        document.getElementById('day1HeadingWrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    document.getElementById('loadingIndicator').style.display = 'none';
}

/**
 * Processes players, allocates speedups, filters, creates lists, and schedules appointments.
 * @param {Array<PlayerObject>} players - Array of player objects from CSV.
 * @param {number} minHours - Minimum hours required for construction+research or training.
 */
async function processAndSchedule(players) {
    calculateScheduleData(players);
    try {
        await saveSchedulerData(schedulerData);
    } catch (e) {
        console.error("Failed to save scheduler data to storage", e);
    }
    renderUI(schedulerData);
}



/**
 * Loads the scheduler system with the provided data.
 * Populates the internal state and updates the UI.
 * @param {SchedulerData} data - The scheduler data to load.
 */
function loadSchedulerSystem(data) {
    // Update global state
    Object.assign(schedulerData, data);

    // Set defaults for new fields
    schedulerData.constructionKingDay = schedulerData.constructionKingDay ?? 1;
    schedulerData.researchKingDay = schedulerData.researchKingDay ?? 2;
    schedulerData.assignments[3] = schedulerData.assignments[3] ?? { ministers: [], advisors: [] };

    // Update UI inputs
    const minHoursInput = document.getElementById('minHoursInput');
    if (minHoursInput) {
        minHoursInput.value = data.minHours || 20;
    }
    const constructionDayInput = document.getElementById('constructionKingDay');
    if (constructionDayInput) {
        constructionDayInput.value = schedulerData.constructionKingDay;
    }
    const researchDayInput = document.getElementById('researchKingDay');
    if (researchDayInput) {
        researchDayInput.value = schedulerData.researchKingDay;
    }

    // Render the UI
    renderUI(schedulerData);
    console.log(`Loaded scheduler data created at ${new Date(data.creationTimeMS).toLocaleString()}`);
}

/**
 * Checks for and loads the most recent scheduler data from storage if it is less than 5 days old.
 */
async function loadRecentData() {
    try {
        const recentData = await getMostRecentSchedulerData();
        if (recentData) {
            const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
            const age = Date.now() - recentData.creationTimeMS;
            if (age < fiveDaysInMs) {
                console.log('Found recent data, loading...');
                loadSchedulerSystem(recentData);
            } else {
                console.log('Recent data found but it is older than 5 days. Ignoring.');
            }
        } else {
            console.log('No recent data found.');
        }
    } catch (loadError) {
        console.warn('Error loading scheduler system:', loadError);
    }
}

/**
 * Exports the current scheduler data to a JSON file.
 */
function exportSchedulerData() {
    if (!schedulerData.creationTimeMS) {
        alert('No data to export. Please process a CSV file first.');
        return;
    }
    
    const dataStr = JSON.stringify(schedulerData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `scheduler_data_${schedulerData.creationTimeMS}.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Validates if the object has the required SchedulerData fields.
 * @param {Object} data - The object to check.
 * @returns {boolean} True if valid.
 */
function isValidSchedulerData(data) {
    const requiredFields = ['rawPlayers', 'processedPlayers', 'assignments', 'minHours', 'creationTimeMS'];
    return requiredFields.every(field => Object.prototype.hasOwnProperty.call(data, field));
}

// Event Listeners for Import/Export

// Auto-load on startup
document.addEventListener('DOMContentLoaded', () => {
    loadRecentData();
    // Initialize modals
    // @ts-ignore
    new bootstrap.Modal(document.getElementById('addPlayerModal'));
    // @ts-ignore
    new bootstrap.Modal(document.getElementById('assignmentModal'));
    // @ts-ignore
    new bootstrap.Modal(document.getElementById('removeUserModal'));

    // Setup event listeners after DOM is loaded

    // Event listener for CSV file input
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

    // Event listeners for Import/Export
    document.getElementById('exportBtn').addEventListener('click', exportSchedulerData);

    const importBtn = document.getElementById('importBtn');
    const jsonFileInput = document.getElementById('jsonFileInput');

    importBtn.addEventListener('click', function() {
        jsonFileInput.click();
    });

    jsonFileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const text = e.target.result;
                const data = JSON.parse(text);

                if (isValidSchedulerData(data)) {
                    loadSchedulerSystem(data);
                    // Save to OPFS
                    await saveSchedulerData(data);
                } else {
                    alert('Invalid scheduler data file. Missing required fields.');
                }
            } catch (error) {
                console.error('Error importing file:', error);
                alert('Error parsing JSON file.');
            } finally {
                // Reset input so same file can be selected again if needed
                jsonFileInput.value = '';
            }
        };
        reader.readAsText(file);
    });
});

// --- Management Logic ---

/**
 * Handles the "Add Player" form submission.
 * Parses input, allocates speedups, filters, and attempts to find slots.
 * Updates UI and notifies the user.
 */
function submitAddPlayer() {
    const form = document.getElementById('addPlayerForm');
    // @ts-ignore
    const formData = new FormData(form);
    
    // Create new player object
    const checkedCategories = [];
    if (formData.get('soldierTraining')) checkedCategories.push('Soldier Training');
    if (formData.get('construction')) checkedCategories.push('Construction');
    if (formData.get('research')) checkedCategories.push('Research');

    const newPlayer = {
        [ALLIANCE]: formData.get('alliance'),
        [PLAYER]: formData.get('player'),
        [GENERAL_SPEEDUPS]: parseFloat(formData.get('generalSpeedups').toString()) || 0,
        [GENERAL_USED_FOR]: checkedCategories.join(', '),
        [SOLDIER_TRAINING]: parseFloat(formData.get('soldierTraining').toString()) || 0,
        [CONSTRUCTION]: parseFloat(formData.get('construction').toString()) || 0,
        [RESEARCH]: parseFloat(formData.get('research').toString()) || 0,
        [TRUEGOLD_PIECES]: parseFloat(formData.get('truegoldPieces').toString()) || 0,
        [TIME_SLOT_START_UTC]: normalizeTime(formData.get('timeSlotStartUtc').toString()) || '00:00',
        [TIME_SLOT_END_UTC]: normalizeTime(formData.get('timeSlotEndUtc').toString()) || '23:59',
        [ALL_TIMES]: formData.get('allTimes')
    };
    
    // Parse time ranges
    // @ts-ignore
    newPlayer.availableTimeRanges = parseTimeRanges(newPlayer[ALL_TIMES]);
    // @ts-ignore
    const overallRanges = parseTimeRanges(`${newPlayer[TIME_SLOT_START_UTC]}-${newPlayer[TIME_SLOT_END_UTC]}`);
    newPlayer.availableTimeRanges = unionTimeRanges(overallRanges.concat(newPlayer.availableTimeRanges));

    // 1. Allocate General Speedups
    // @ts-ignore
    allocateGeneralSpeedups(newPlayer);
    
    // Add to rawPlayers and processedPlayers
    // @ts-ignore
    schedulerData.rawPlayers.push(JSON.parse(JSON.stringify(newPlayer)));
    // @ts-ignore
    schedulerData.processedPlayers.push(newPlayer);
    
    // Initialize assignment tracking
    // @ts-ignore
    const playerId = `${newPlayer[PLAYER]}-${newPlayer[ALLIANCE]}`;
    schedulerData.playerAssignments[playerId] = { ministerAssigned: false, advisorAssigned: false };

    // 2. Filter Check
    const minHours = schedulerData.minHours;
    // @ts-ignore
    const isMinisterQualified = (newPlayer[CONSTRUCTION] + newPlayer[RESEARCH]) >= minHours;
    // @ts-ignore
    const isAdvisorQualified = newPlayer[SOLDIER_TRAINING] >= minHours;
    
    if (!isMinisterQualified && !isAdvisorQualified) {
        // @ts-ignore
        schedulerData.filteredOut.push(newPlayer);
        finishManagementAction("Player added but filtered out due to insufficient hours.");
        return;
    }

    // 3. Schedule Logic (Incremental)
    /** @type {Array<{day: number, role: string, slotStr: string}>} */
    const assignmentsMade = [];

    // Attempt Construction buff
    if (player[CONSTRUCTION] >= minHours && !schedulerData.playerAssignments[playerId].ministerAssigned) {
        const constructDay = parseInt(document.getElementById('constructionKingDay').value) || 1;
        const taken = new Set(schedulerData.assignments[constructDay].ministers.map(a => a.start));
        const slots = generateTimeSlots();
        for (const slot of slots) {
            // @ts-ignore
            if (!taken.has(slot.start) && isSlotAvailable(newPlayer, slot.start, slot.end)) {
                schedulerData.assignments[constructDay].ministers.push({
                    start: slot.start,
                    end: slot.end,
                    // @ts-ignore
                    alliance: newPlayer[ALLIANCE],
                    // @ts-ignore
                    player: newPlayer[PLAYER],
                    // @ts-ignore
                    speedups: `${Math.round(newPlayer[CONSTRUCTION])}`,
                    // @ts-ignore
                    truegold: newPlayer[TRUEGOLD_PIECES]
                });
                schedulerData.playerAssignments[playerId].ministerAssigned = true;
                assignmentsMade.push({ day: constructDay, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                break;
            }
        }
        // Fallback to other days in 1,2,5
        if (!schedulerData.playerAssignments[playerId].ministerAssigned) {
            const fallbackDays = [1, 2, 5].filter(d => d !== constructDay);
            for (const day of fallbackDays) {
                const takenFallback = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
                for (const slot of slots) {
                    // @ts-ignore
                    if (!takenFallback.has(slot.start) && isSlotAvailable(newPlayer, slot.start, slot.end)) {
                        schedulerData.assignments[day].ministers.push({
                            start: slot.start,
                            end: slot.end,
                            // @ts-ignore
                            alliance: newPlayer[ALLIANCE],
                            // @ts-ignore
                            player: newPlayer[PLAYER],
                            // @ts-ignore
                            speedups: `${Math.round(newPlayer[CONSTRUCTION])}`,
                            // @ts-ignore
                            truegold: newPlayer[TRUEGOLD_PIECES]
                        });
                        schedulerData.playerAssignments[playerId].ministerAssigned = true;
                        assignmentsMade.push({ day: day, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                        break;
                    }
                }
                if (schedulerData.playerAssignments[playerId].ministerAssigned) break;
            }
        }
    }

    // Attempt Research buff
    if (player[RESEARCH] >= minHours && !schedulerData.playerAssignments[playerId].ministerAssigned) {
        const researchDay = parseInt(document.getElementById('researchKingDay').value) || 2;
        const taken = new Set(schedulerData.assignments[researchDay].ministers.map(a => a.start));
        const slots = generateTimeSlots();
        for (const slot of slots) {
            // @ts-ignore
            if (!taken.has(slot.start) && isSlotAvailable(newPlayer, slot.start, slot.end)) {
                schedulerData.assignments[researchDay].ministers.push({
                    start: slot.start,
                    end: slot.end,
                    // @ts-ignore
                    alliance: newPlayer[ALLIANCE],
                    // @ts-ignore
                    player: newPlayer[PLAYER],
                    // @ts-ignore
                    speedups: `${Math.round(newPlayer[RESEARCH])}`,
                    // @ts-ignore
                    truegold: newPlayer[TRUEGOLD_PIECES]
                });
                schedulerData.playerAssignments[playerId].ministerAssigned = true;
                assignmentsMade.push({ day: researchDay, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                break;
            }
        }
        // Fallback to other days in 1,2,5
        if (!schedulerData.playerAssignments[playerId].ministerAssigned) {
            const fallbackDays = [1, 2, 5].filter(d => d !== researchDay);
            for (const day of fallbackDays) {
                const takenFallback = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
                for (const slot of slots) {
                    // @ts-ignore
                    if (!takenFallback.has(slot.start) && isSlotAvailable(newPlayer, slot.start, slot.end)) {
                        schedulerData.assignments[day].ministers.push({
                            start: slot.start,
                            end: slot.end,
                            // @ts-ignore
                            alliance: newPlayer[ALLIANCE],
                            // @ts-ignore
                            player: newPlayer[PLAYER],
                            // @ts-ignore
                            speedups: `${Math.round(newPlayer[RESEARCH])}`,
                            // @ts-ignore
                            truegold: newPlayer[TRUEGOLD_PIECES]
                        });
                        schedulerData.playerAssignments[playerId].ministerAssigned = true;
                        assignmentsMade.push({ day: day, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                        break;
                    }
                }
                if (schedulerData.playerAssignments[playerId].ministerAssigned) break;
            }
        }
    }

    // Attempt Advisor (Day 4)
    if (player[SOLDIER_TRAINING] >= minHours && !schedulerData.playerAssignments[playerId].advisorAssigned) {
        const day = 4;
        const advisorSlots = generateTimeSlots();
        const ministerSlots = generateTimeSlots(); // For overflow
        const takenAdvisor = new Set(schedulerData.assignments[day].advisors.map(a => a.start));
        const takenMinister = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
        let assigned = false;

        // Try standard Advisor slot
        for (const slot of advisorSlots) {
              // @ts-ignore
              if (!takenAdvisor.has(slot.start) && isSlotAvailable(newPlayer, slot.start, slot.end)) {
                schedulerData.assignments[day].advisors.push({
                    start: slot.start,
                    end: slot.end,
                    // @ts-ignore
                    alliance: newPlayer[ALLIANCE],
                    // @ts-ignore
                    player: newPlayer[PLAYER],
                    // @ts-ignore
                    speedups: Math.round(newPlayer[SOLDIER_TRAINING]),
                    // @ts-ignore
                    truegold: newPlayer[TRUEGOLD_PIECES]
                });
                schedulerData.playerAssignments[playerId].advisorAssigned = true;
                assignmentsMade.push({ day: day, role: 'advisors', slotStr: `${slot.start}-${slot.end}` });
                assigned = true;
                break;
              }
        }

        // Overflow to Chief Minister if needed and not already ministerAssigned
        if (!assigned && !schedulerData.playerAssignments[playerId].ministerAssigned) {
              for (const slot of ministerSlots) {
                  // @ts-ignore
                  if (!takenMinister.has(slot.start) && isSlotAvailable(newPlayer, slot.start, slot.end)) {
                    schedulerData.assignments[day].ministers.push({
                        start: slot.start,
                        end: slot.end,
                        // @ts-ignore
                        alliance: newPlayer[ALLIANCE],
                        // @ts-ignore
                        player: newPlayer[PLAYER],
                        // @ts-ignore
                        speedups: `${Math.round(newPlayer[CONSTRUCTION])} / ${Math.round(newPlayer[RESEARCH])}`,
                        // @ts-ignore
                        truegold: newPlayer[TRUEGOLD_PIECES]
                    });
                      schedulerData.playerAssignments[playerId].advisorAssigned = true; // Counts as advisor
                      schedulerData.playerAssignments[playerId].ministerAssigned = true; // Prevent double CM globally
                      assignmentsMade.push({ day: 4, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                      assigned = true;
                      break;
                  }
              }
        }
    }
    
    // 4. Finalize
    if (assignmentsMade.length === 0) {
        schedulerData.waitingList.push({
            // @ts-ignore
            alliance: newPlayer[ALLIANCE],
            // @ts-ignore
            player: newPlayer[PLAYER],
            speedups: {
                // @ts-ignore
                soldier: Math.round(newPlayer[SOLDIER_TRAINING]),
                // @ts-ignore
                construction: Math.round(newPlayer[CONSTRUCTION]),
                // @ts-ignore
                research: Math.round(newPlayer[RESEARCH])
            },
            // @ts-ignore
            truegold: Math.round(newPlayer[TRUEGOLD_PIECES]),
            // @ts-ignore
            timeSlots: newPlayer.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ') || 'No available ranges'
        });
        finishManagementAction("Player added to Waiting List (no slots found).");
    } else {
        const assignmentStrings = assignmentsMade.map(assignment => {
            const roleName = assignment.role === 'ministers' ? 'Chief Minister' : 'Noble Advisor';
            return `Day ${assignment.day} ${roleName} (${assignment.slotStr})`;
        });
        finishManagementAction(`Player added. Assigned: ${assignmentStrings.join(', ')}.`);
    }
}

/**
 * Common finish steps for management actions: save, render, notify, close modals.
 * @param {string} message - Notification message.
 */
    async function finishManagementAction(message) {
    // Sort assignments before rendering
    [1, 2, 3, 4, 5].forEach(day => {
        schedulerData.assignments[day].ministers.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        schedulerData.assignments[day].advisors.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    });

    try {
        await saveSchedulerData(schedulerData);
    } catch (e) {
        console.error("Save failed", e);
    }
    renderUI(schedulerData);
    
    // Close modals
    // @ts-ignore
    bootstrap.Modal.getInstance(document.getElementById('addPlayerModal'))?.hide();
    // @ts-ignore
    bootstrap.Modal.getInstance(document.getElementById('assignmentModal'))?.hide();
    // @ts-ignore
    bootstrap.Modal.getInstance(document.getElementById('removeUserModal'))?.hide();
    
    // Show notification
    const alert = document.getElementById('assignmentNotification');
    document.getElementById('assignmentNotificationText').textContent = message;
    alert.style.display = 'block';
}

/**
 * Removes a user entirely from the system.
 */
function openRemoveUserModal() {
    const select = document.getElementById('removeUserSelect');
    select.innerHTML = '';
    
    // Populate with all players sorted
    const allPlayers = [...schedulerData.processedPlayers].sort((a, b) => 
        (a.alliance + a.player).localeCompare(b.alliance + b.player)
    );
    
    allPlayers.forEach(p => {
        const option = document.createElement('option');
        option.value = `${p.player}-${p.alliance}`;
        option.textContent = `${p.alliance} / ${p.player}`;
        select.appendChild(option);
    });
    
    // @ts-ignore
    new bootstrap.Modal(document.getElementById('removeUserModal')).show();
}

function submitRemoveUser() {
    const select = document.getElementById('removeUserSelect');
    // @ts-ignore
    const idToRemove = select.value;
    if (!idToRemove) return;
    
    // 1. Remove from player lists
    schedulerData.rawPlayers = schedulerData.rawPlayers.filter(p => `${p.player}-${p.alliance}` !== idToRemove);
    schedulerData.processedPlayers = schedulerData.processedPlayers.filter(p => `${p.player}-${p.alliance}` !== idToRemove);
    schedulerData.filteredOut = schedulerData.filteredOut.filter(p => `${p.player}-${p.alliance}` !== idToRemove);
    schedulerData.waitingList = schedulerData.waitingList.filter(p => `${p.player}-${p.alliance}` !== idToRemove);
    
    // 2. Remove from assignments
    [1, 2, 3, 4, 5].forEach(day => {
        schedulerData.assignments[day].ministers = schedulerData.assignments[day].ministers.filter(a => `${a.player}-${a.alliance}` !== idToRemove);
        schedulerData.assignments[day].advisors = schedulerData.assignments[day].advisors.filter(a => `${a.player}-${a.alliance}` !== idToRemove);
    });
    
    // 3. Remove from assignment tracking
    delete schedulerData.playerAssignments[idToRemove];
    
    finishManagementAction("User removed successfully.");
}

// --- Assignment/Reassignment Logic ---

let currentReassignTarget = null; // { day, role, existingSlotStart, existingSlotEnd, player, alliance } OR null (new assignment)

/**
 * Opens the assignment modal.
 * @param {string} alliance 
 * @param {string} player 
 * @param {Object} [existing] - If reassigning, details of the current slot.
 */
function openAssignmentModal(alliance, player, existing = null) {
    currentReassignTarget = existing ? { ...existing, alliance, player } : { alliance, player };
    
    const title = existing ? `Reassign ${alliance}/${player}` : `Assign ${alliance}/${player}`;
    document.getElementById('assignmentModalTitle').textContent = title;
    
    updateAssignmentSlots();
    // @ts-ignore
    new bootstrap.Modal(document.getElementById('assignmentModal')).show();
}

/**
 * Updates the list of available slots in the modal based on selected day/role.
 */
function updateAssignmentSlots() {
    // @ts-ignore
    const day = parseInt(document.getElementById('assignDaySelect').value);
    // @ts-ignore
    const role = document.getElementById('assignRoleSelect').value; // 'ministers' or 'advisors'
    const container = document.getElementById('assignmentSlotsContainer');
    container.innerHTML = '';
    
    // Get target player object
    const targetId = currentReassignTarget.player + '-' + currentReassignTarget.alliance;
    const playerObj = schedulerData.processedPlayers.find(p => `${p.player}-${p.alliance}` === targetId);
    
    if (!playerObj) return;

    // Get taken slots
    const currentAssignments = schedulerData.assignments[day][role];
    const takenStarts = new Set(currentAssignments.map(a => a.start));
    
    // Determine qualification check
    let qualified = false;
    if (role === 'ministers') {
        // Any minister slot requires minister qualification OR it's Day 4 overflow (which counts as advisor)
        // BUT strict qualification: 
        if ((playerObj[CONSTRUCTION] + playerObj[RESEARCH]) >= schedulerData.minHours) qualified = true;
        // Exception: Day 4 Minister slot can be used by Advisor qualified players as overflow
        if (day === 4 && playerObj[SOLDIER_TRAINING] >= schedulerData.minHours) qualified = true; 
    } else {
        if (playerObj[SOLDIER_TRAINING] >= schedulerData.minHours) qualified = true;
    }
    
    if (!qualified) {
        container.innerHTML = '<div class="alert alert-warning">Player does not meet minimum hours for this role/day configuration.</div>';
        return;
    }

    const slots = generateTimeSlots();
    slots.forEach(slot => {
        if (takenStarts.has(slot.start)) return; // Slot taken
        
        // Basic availability check
        if (!isSlotAvailable(playerObj, slot.start, slot.end)) return; // Player busy (time conflict)
        
        // Create List Item
        const item = document.createElement('button');
        item.className = 'list-group-item list-group-item-action';
        
        // Highlight if "preferred" (matches availableTimeRanges explicitly)
        // isSlotAvailable returns true if they fit. To "green" it, we can check if it falls inside a specific range 
        // vs just the overall window. But isSlotAvailable already does logic. 
        // Let's assume green if it fits one of their specific ranges if they have any.
        // @ts-ignore
        if (playerObj.availableTimeRanges.length > 0) {
            // Re-use logic: isSlotAvailable logic implies it fits. 
            item.classList.add('list-group-item-success');
        }
        
        item.textContent = `${slot.start} - ${slot.end}`;
        item.onclick = () => performAssignment(day, role, slot.start, slot.end);
        container.appendChild(item);
    });
    
    if (container.children.length === 0) {
        container.innerHTML = '<div class="p-3 text-muted">No available slots found.</div>';
    }
}

/**
 * Executes the assignment selected from the modal.
 */
function performAssignment(day, role, start, end) {
    const { alliance, player } = currentReassignTarget;
    const targetId = `${player}-${alliance}`;
    const playerObj = schedulerData.processedPlayers.find(p => `${p.player}-${p.alliance}` === targetId);

    // 1. If Reassigning, remove old assignment first
    if (currentReassignTarget.existingSlotStart) {
        const oldDay = currentReassignTarget.day;
        const oldRole = currentReassignTarget.role;
        // Remove from list
        schedulerData.assignments[oldDay][oldRole] = schedulerData.assignments[oldDay][oldRole].filter(
            a => !(a.start === currentReassignTarget.existingSlotStart && a.alliance === alliance && a.player === player)
        );
    } 
    // If Assigning from list, remove from waiting/filtered
    else {
        schedulerData.waitingList = schedulerData.waitingList.filter(p => !(`${p.player}-${p.alliance}` === targetId));
        schedulerData.filteredOut = schedulerData.filteredOut.filter(p => !(`${p.player}-${p.alliance}` === targetId));
    }

    // 2. Add new assignment
    const newAssignment = {
        start: start,
        end: end,
        alliance: alliance,
        player: player,
        // Calc speedups based on role
        speedups: role === 'ministers' 
            ? `${Math.round(playerObj[CONSTRUCTION])} / ${Math.round(playerObj[RESEARCH])}`
            : Math.round(playerObj[SOLDIER_TRAINING]),
        truegold: playerObj[TRUEGOLD_PIECES]
    };
    schedulerData.assignments[day][role].push(newAssignment);
    
    // 3. Update Tracking
    // Note: This logic is simple; doesn't strictly enforce "1 minister slot max" if user overrides via UI.
    // But we update flags for consistency.
    if (role === 'ministers') {
        // Special case: Day 4 Minister might be Advisor overflow
        // If we are on Day 4 and strict minister req isn't met but advisor is...
        // For simplicity, if it's Day 4, we mark advisorAssigned if they are advisor qualified?
        // Or just mark based on the role column?
        // Let's stick to the convention: Day 4 minister slot is ambiguous.
        // We'll just mark ministerAssigned unless it's strictly advisor logic. 
        // However, user manual assignment overrides rules.
        schedulerData.playerAssignments[targetId].ministerAssigned = true;
    } else {
        schedulerData.playerAssignments[targetId].advisorAssigned = true;
    }

    finishManagementAction(`Assigned ${alliance}/${player} to Day ${day} ${role === 'ministers' ? 'Chief Minister' : 'Noble Advisor'} (${start}-${end}).`);
}

/**
 * Unassigns a player from a specific slot.
 */
function removeAssignment(day, role, start, alliance, player) {
    // Remove from array
    schedulerData.assignments[day][role] = schedulerData.assignments[day][role].filter(
        a => !(a.start === start && a.alliance === alliance && a.player === player)
    );
    
    // We don't necessarily reset the 'ministerAssigned' flag because they might have other slots?
    // Current logic enforces 1 slot per role type generally. 
    // Checking if they have other slots of this type is safer.
    const hasOtherMinister = [1,2,4,5].some(d => schedulerData.assignments[d].ministers.some(a => a.alliance === alliance && a.player === player));
    const hasOtherAdvisor = [1,2,4,5].some(d => schedulerData.assignments[d].advisors.some(a => a.alliance === alliance && a.player === player));
    
    const id = `${player}-${alliance}`;
    schedulerData.playerAssignments[id].ministerAssigned = hasOtherMinister;
    schedulerData.playerAssignments[id].advisorAssigned = hasOtherAdvisor;

    // Add back to waiting list? The prompt didn't strictly say, but usually yes.
    // Or just leave them floating (available to be assigned). 
    // "cancel just discards, add adds... remove removes... reassign lets user assign"
    // We'll add them to waiting list so they are visible for re-adding.
    if (!hasOtherMinister && !hasOtherAdvisor) {
        // Re-construct waiting entry
        const p = schedulerData.processedPlayers.find(pl => pl.alliance === alliance && pl.player === player);
        if (p) {
            schedulerData.waitingList.push({
                alliance: p[ALLIANCE],
                player: p[PLAYER],
                speedups: {
                    soldier: Math.round(p[SOLDIER_TRAINING]),
                    construction: Math.round(p[CONSTRUCTION]),
                    research: Math.round(p[RESEARCH])
                },
                truegold: Math.round(p[TRUEGOLD_PIECES]),
                timeSlots: p.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ') || 'No available ranges'
            });
        }
    }

    finishManagementAction(`Removed assignment for ${alliance}/${player}.`);
}