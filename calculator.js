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
 * @property {Object<number, Array<WaitingPlayer>>} waitingLists - Waiting list per day (keys: 1, 2, 4, 5).
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
    waitingLists: { 1: [], 2: [], 4: [], 5: [] },
    filteredOut: [],
    constructionAssignments: {},
    researchAssignments: {},
    trainingAssignments: {},
    minHours: 20,
    creationTimeMS: 0,
    lastModifiedTimeMS: 0,
    constructionKingDay: 1,
    researchKingDay: 2
};

// Constants for CSV field names are imported from parse.js

// Constants for categories in 'General Used For'
const CATEGORY_SOLDIER_TRAINING = 'soldier training';
const CATEGORY_CONSTRUCTION = 'construction';
const CATEGORY_RESEARCH = 'research';

/**
 * Calculates total available minutes from a player's time ranges.
 * @param {PlayerObject} player - The player object.
 * @returns {number} Total minutes available.
 */
function getTotalAvailableMinutes(player) {
    if (!player.availableTimeRanges || player.availableTimeRanges.length === 0) return 0;
    return player.availableTimeRanges.reduce((sum, range) => {
        let start = timeToMinutes(range.start);
        let end = timeToMinutes(range.end);
        if (end < start) end += 1440; // Handle overnight ranges crossing midnight
        return sum + (end - start);
    }, 0);
}

/**
 * Calculates the sum of all speedups (soldier training + construction + research).
 * @param {PlayerObject} player - The player object.
 * @returns {number} Sum of all speedups.
 */
function getAllSpeedupsSum(player) {
    return (player[SOLDIER_TRAINING] || 0) + (player[CONSTRUCTION] || 0) + (player[RESEARCH] || 0);
}

/**
 * Performs the first pass of greedy assignment for initial scheduling Round 1: Sorts players by shortest available time, then assigns to the first available fitting slot based on availability.
 * This function ONLY handles the assignment logic; day-specific updates (flags, appointments, taken sets) MUST be batched by the caller after calling.
 * 
 * Usage Instructions for Caller:
 * 1. Prepare unscheduled: Array of players to consider (e.g., players.slice()).
 * 2. Prepare assignedPlayerSlots: Empty array [] to accumulate {player, slot}.
 * 3. Prepare slots: Immutable array of slots to check (e.g., generateTimeSlots()).
 * 4. Call: assignFirstPass(unscheduled, slots, assignedPlayerSlots);
 * 5. After call: assignedPlayerSlots contains new assignments; unscheduled has removed assigned players (ready for Round 2 if using performDisplacement).
 *    Iterate over assignedPlayerSlots to update scheduler state (e.g., create Appointment objects with day/role fields, push to schedulerData.assignments[day][role], set flags like trainingAssignments[playerId] = true, add to taken sets).
 *    Do NOT perform these updates inside this function—batch them externally for specificity.
 * 
 * Mutation Notes: Mutates unscheduled (removes assigned players) and assignedPlayerSlots (adds assignments); relies on slot availability checks (no evaluator).
 * 
 * @param {Array<PlayerObject>} unscheduled - Mutable array of players to assign (will be sorted and have assigned players removed).
 * @param {Array<{start: string, end: string}>} slots - Immutable array of slot objects to check for availability.
 * @param {Array<{player: PlayerObject, slot: {start: string, end: string}}>} assignedPlayerSlots - Mutable accumulator array for new assignments as {player, slot}.
 */
function assignFirstPass(unscheduled, slots, assignedPlayerSlots) {
    // Sort unscheduled by shortest available time
    unscheduled.sort((a, b) => getTotalAvailableMinutes(a) - getTotalAvailableMinutes(b));
    
    // Assign greedily
    for (let i = 0; i < unscheduled.length; i++) {
        const candidate = unscheduled[i];
        const slot = slots.find(s => 
            !assignedPlayerSlots.some(ap => ap.slot.start === s.start) && 
            isSlotAvailable(candidate, s.start, s.end)
        );
        if (slot) {
            assignedPlayerSlots.push({ player: candidate, slot });
            unscheduled.splice(i, 1);
            i--; // Adjust index after removal
        }
    }
}

/**
 * Performs displacement optimization for scheduling Round 2 (generic for any role/day).
 * This function only handles player swapping between unassigned and assigned lists; it does NOT update schedulerData flags, taken sets, appointment creation, or any other day/role-specific state.
 * It assumes the caller has already prepared assignedPlayerSlots from Round 1's greedy assignment.
 * 
 * Usage Instructions for Caller:
 * 1. Before calling: Prepare `assignedPlayerSlots` (Array<{player: PlayerObject, slot: {start: string, end: string}}>) from Round 1's assignment results.
 *    Generate slots via generateTimeSlots(), assign first available to eligible players via isSlotAvailable(), and push {player, slot} to the array.
 * 2. Prepare unscheduled (Array<PlayerObject>) from leftover players after Round 1.
 * 3. Call: performDisplacement(unscheduled, assignedPlayerSlots, evaluator); Note: evaluator is (player) => number (higher is better, e.g., (p) => p[CONSTRUCTION]).
 * 4. After returned displacements, iterate over final assignedPlayerSlots and final unscheduled to update scheduler state:
 *    - For each in assignedPlayerSlots: Create Appointment object with day/role-specific fields (e.g., speedups, truegold), push to schedulerData.assignments[day][role], update flags (e.g., schedulerData.constructionAssignments[playerId] = true), remove/update taken sets.
 *    - The caller is responsible for marking the player as assigned for this day (no auto-updates in this function).
 *    - Process displacements if needed (though they are reflected in the mutated lists).
 *    - Do NOT perform these updates inside this function; batch them externally for day/role specificity.
 * 
 * Note: Mutates unscheduled and assignedPlayerSlots in-place. Returns displacements for logging/inspection, but primary effect is list mutations.
 * 
 * @param {Array<PlayerObject>} unscheduled - Mutable array of unscheduled players (sorted and modified in-place: removes assigned candidates, adds back displaced ones).
 * @param {Array<{player: PlayerObject, slot: {start: string, end: string}}>} assignedPlayerSlots - Mutable array of currently assigned {player, slot} objects (modified: replaced displaced players with candidates in-place).
 * @param {Function} evaluator - Function to evaluate a player's value: (player) => number (higher values are better; used for sorting and displacement comparison).
 * @returns {Array<{candidate: PlayerObject, displaced: PlayerObject, slot: {start: string, end: string}}>} List of displacement actions performed (for caller inspection; mutations handle the list changes).
 */
function performDisplacement(unscheduled, assignedPlayerSlots, evaluator) {
    const displacements = [];
    let changed = true;
    while (changed && unscheduled.length > 0) {
        changed = false;
        
        // Sort unscheduled using evaluator (descending: higher value first)
        unscheduled.sort((a, b) => evaluator(b) - evaluator(a));
        
        for (let i = 0; i < unscheduled.length; i++) {
            const candidate = unscheduled[i];
            const candidateValue = evaluator(candidate);
            
            // Find the best displacement target (lowest value among assigned players available in their slot)
            let bestTargetIndex = -1;
            let minTargetValue = Infinity;
            
            for (let j = 0; j < assignedPlayerSlots.length; j++) {
                const assigned = assignedPlayerSlots[j];
                if (!isSlotAvailable(candidate, assigned.slot.start, assigned.slot.end)) continue;
                
                const targetValue = evaluator(assigned.player);
                if (targetValue < minTargetValue) {
                    minTargetValue = targetValue;
                    bestTargetIndex = j;
                }
            }
            
            if (bestTargetIndex === -1 || candidateValue <= minTargetValue) continue;
            
            // Perform displacement: swap players, record displacement
            const displacedPlayer = assignedPlayerSlots[bestTargetIndex].player;
            const displacedSlot = assignedPlayerSlots[bestTargetIndex].slot;
            
            // Update lists: remove displaced from assignedPlayerSlots, add candidate with same slot, remove candidate from unscheduled, add displaced to unscheduled
            assignedPlayerSlots[bestTargetIndex] = { player: candidate, slot: displacedSlot };
            unscheduled.splice(i, 1);
            unscheduled.push(displacedPlayer);
            
            displacements.push({ candidate, displaced: displacedPlayer, slot: displacedSlot });
            
            changed = true;
            break; // Re-sort for next iteration
        }
    }
    return displacements;
}

/**
 * Assigns initial ministers for a specific King/Queen day using a two-round process.
 * Round 1: Sort by shortest available time, assign to first available slot.
 * Round 2: Displace scheduled players with fewer relevant speedups if a waiting player has more.
 * @param {number} day - The day number (1 or 2).
 * @param {Array<PlayerObject>} players - Array of eligible players.
 * @param {string} speedupProp - Property name for relevant speedup (CONSTRUCTION or RESEARCH).
 * @param {string} assignmentFlag - Flag property in schedulerData (e.g., 'constructionAssignments').
 * @param {SchedulerData} schedulerData - Main data object.
 */
function assignInitialMinisters(day, players, speedupProp, assignmentFlag, schedulerData) {
    // Round 1: Greedy Assignment (using assignFirstPass)
    const unscheduled = players.slice(); // Copy to mutate
    const slots = generateTimeSlots();
    const assignedPlayerSlots = []; 
    
    // Check for pre-existing assignments (if any logic added assignments before this)
    // Filter unscheduled to remove already assigned (should be handled by caller passing eligible players, but safety check)
    // Actually, assignFirstPass handles sorting and assignment.
    // However, if players array contains already-assigned players (via other flags), we should filter them first?
    // The previous implementation checked `if (schedulerData[assignmentFlag][playerId]) continue`.
    // Let's filter unscheduled first.
    for (let i = unscheduled.length - 1; i >= 0; i--) {
        const p = unscheduled[i];
        if (schedulerData[assignmentFlag][`${p[PLAYER]}-${p[ALLIANCE]}`]) {
            unscheduled.splice(i, 1);
        }
    }

    assignFirstPass(unscheduled, slots, assignedPlayerSlots);

    // Round 2: Displacement
    performDisplacement(unscheduled, assignedPlayerSlots, (p) => p[speedupProp]);

    // Finalize Assignments
    const taken = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
    
    assignedPlayerSlots.forEach(({ player, slot }) => {
         const appointment = {
            start: slot.start,
            end: slot.end,
            alliance: player[ALLIANCE],
            player: player[PLAYER],
            speedups: `${Math.round(player[speedupProp])}`,
            truegold: player[TRUEGOLD_PIECES],
            rawSpeedup: player[speedupProp] 
        };
        schedulerData.assignments[day].ministers.push(appointment);
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        schedulerData[assignmentFlag][playerId] = true;
        taken.add(slot.start);
    });

    // Add remaining unscheduled to day's waiting list
    schedulerData.waitingLists[day].push(...unscheduled.map(player => ({
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
}

/**
 * Schedules the training day (Day 4) fulfilling soldier training quotas.
 * Prioritizes Noble Advisors, overflows to Chief Ministers.
 * Each stage uses two rounds: shortest time slots first, then displacement.
 * @param {Array<PlayerObject>} players - Array of eligible players (soldier training >= minHours).
 * @param {number} minHours - Minimum hours.
 * @param {SchedulerData} schedulerData - Main data object.
 */
function scheduleTrainingDay(players, minHours, schedulerData) {
    const day = 4;
    const advisorSlots = generateTimeSlots();
    const ministerSlots = generateTimeSlots(); // Independent slots for overflow
    
    // --- STAGE 1: Noble Advisors ---
    
    let unscheduledForAdvisor = players.filter(p => !schedulerData.trainingAssignments[`${p[PLAYER]}-${p[ALLIANCE]}`]);
    const assignedAdvisorSlots = [];

    // Round 1: Greedy Assignment
    assignFirstPass(unscheduledForAdvisor, advisorSlots, assignedAdvisorSlots);

    // Round 2: Advisor Displacement
    performDisplacement(unscheduledForAdvisor, assignedAdvisorSlots, (p) => p[SOLDIER_TRAINING]);
    
    // Finalize Advisor Assignments
    const takenAdvisor = new Set(schedulerData.assignments[day].advisors.map(a => a.start));
    assignedAdvisorSlots.forEach(({ player, slot }) => {
        // console.log(`Assigning Noble Advisor: ${player[PLAYER]} (${player[ALLIANCE]}) to ${slot.start}-${slot.end} with ${player[SOLDIER_TRAINING]} hours`);
        const appointment = {
            start: slot.start,
            end: slot.end,
            alliance: player[ALLIANCE],
            player: player[PLAYER],
            speedups: Math.round(player[SOLDIER_TRAINING]),
            truegold: player[TRUEGOLD_PIECES],
            rawSpeedup: player[SOLDIER_TRAINING]
        };
        schedulerData.assignments[day].advisors.push(appointment);
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        schedulerData.trainingAssignments[playerId] = true;
        takenAdvisor.add(slot.start);
    });

    // --- STAGE 2: Chief Minister Overflow ---
    // Candidates: Players qualified for advisor (training >= minHours) but NOT assigned as advisor
    
    let overflowCandidates = players.filter(p => !schedulerData.trainingAssignments[`${p[PLAYER]}-${p[ALLIANCE]}`]);
    const assignedMinisterSlots = [];

    // Round 1: Greedy Assignment for Overflow
    assignFirstPass(overflowCandidates, ministerSlots, assignedMinisterSlots);

    // Round 2: Minister Overflow Displacement (Displace if Training > C+R)
    performDisplacement(overflowCandidates, assignedMinisterSlots, (p) => p[SOLDIER_TRAINING]);

    // Finalize Minister Overflow Assignments
    const takenMinister = new Set(schedulerData.assignments[day].ministers.map(a => a.start));
    assignedMinisterSlots.forEach(({ player, slot }) => {
        const app = {
            start: slot.start,
            end: slot.end,
            alliance: player[ALLIANCE],
            player: player[PLAYER],
            speedups: `${Math.round(player[CONSTRUCTION])} / ${Math.round(player[RESEARCH])}`,
            truegold: player[TRUEGOLD_PIECES],
            rawSpeedupSum: player[CONSTRUCTION] + player[RESEARCH]
        };
        schedulerData.assignments[day].ministers.push(app);
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        schedulerData.researchAssignments[playerId] = true;
        takenMinister.add(slot.start);
    });

    // Add remaining unassigned to day 4's waiting list
    // overflowCandidates contains those not assigned in Stage 2.
    schedulerData.waitingLists[day].push(...overflowCandidates.map(player => ({
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
}


/**
 * Assigns players from waiting lists or optional players to the spillover day minister slots.
 * Adds unscheduled players to the spillover waiting list in all cases.
 * @param {SchedulerData} schedulerData - Main data object.
 * @param {number} spilloverDay - The day number to assign spillover players to.
 * @param {Array<WaitingPlayer>} [players=null] - Optional array of WaitingPlayer objects to schedule. Must include properties: alliance, player, speedups (object with soldier/construction/research), truegold, timeSlots.
 */
/** @typedef {WaitingPlayer & {originalDay?: number}} SpilloverCandidate */
function scheduleSpilloverDay(schedulerData, spilloverDay, players = null) {
    const constructDay = schedulerData.constructionKingDay;
    const researchDay = schedulerData.researchKingDay;
    /** @type {Array<SpilloverCandidate>} */
    let candidates;

    if (players) {
        candidates = players;
    } else {
        // Exact original aggregation logic
        /** @type {Array<SpilloverCandidate>} */
        const spilloverCandidates = [];
        /** @type {Set<string>} */
        const seenPlayers = new Set();
        [constructDay, researchDay, 4].forEach(sourceDay => {
            if (sourceDay !== spilloverDay && schedulerData.waitingLists[sourceDay]) {
                schedulerData.waitingLists[sourceDay].forEach(player => {
                    const key = `${player.alliance}/${player.player}`;
                    if (!seenPlayers.has(key)) {
                        seenPlayers.add(key);
                        spilloverCandidates.push({ ...player, originalDay: sourceDay });
                    }
                });
            }
        });
        candidates = spilloverCandidates;
    }

    // Exact original assignment logic (unchanged)
    /** @type {Set<string>} */
    const taken = new Set(schedulerData.assignments[spilloverDay].ministers.map(a => a.start));
    /** @type {Array<TimeRange>} */
    const slots = generateTimeSlots();
    /** @type {Array<SpilloverCandidate>} */
    const unscheduled = [];  // Track for universal waiting list addition

    candidates.forEach(candidate => {
        const playerId = `${candidate.player}-${candidate.alliance}`;
        let assigned = false;
        const player = schedulerData.processedPlayers.find(p => p[PLAYER] === candidate.player && p[ALLIANCE] === candidate.alliance);
        if (!player) return;

        for (const slot of slots) {
            if (!taken.has(slot.start) && isSlotAvailable(player, slot.start, slot.end)) {
                if (!(schedulerData.constructionAssignments[playerId] && schedulerData.researchAssignments[playerId])) {
                    // Exact push and flag update as original
                    schedulerData.assignments[spilloverDay].ministers.push({
                         start: slot.start,
                         end: slot.end,
                         alliance: candidate.alliance,
                         player: candidate.player,
                         speedups: `${Math.round(candidate.speedups.construction)} / ${Math.round(candidate.speedups.research)} / ${Math.round(candidate.speedups.soldier)}`,
                         truegold: candidate.truegold
                     });
                    if (!schedulerData.constructionAssignments[playerId]) schedulerData.constructionAssignments[playerId] = true;
                    if (!schedulerData.researchAssignments[playerId]) schedulerData.researchAssignments[playerId] = true;
                    taken.add(slot.start);
                    assigned = true;
                    break;
                }
            }
        }
        if (!assigned) {
            unscheduled.push(candidate);  // Collect in all cases
        }
    });

    // Universal addition: Add unscheduled to waiting list in all cases
    if (unscheduled.length > 0) {
        /** @type {Array<WaitingPlayer>} */
        const toAdd = unscheduled.map(candidate => ({
            alliance: candidate.alliance,
            player: candidate.player,
            speedups: { soldier: candidate.speedups.soldier, construction: candidate.speedups.construction, research: candidate.speedups.research },
            truegold: candidate.truegold,
            timeSlots: candidate.timeSlots
        }));
        schedulerData.waitingLists[spilloverDay].push(...toAdd);
    }
}


// CSV parsing functions have been moved to parse.js



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
            const endHour = hour + Math.floor((minute+30) / 60);
            const endMinute = minute + 30;
            const endMin = endMinute % 60;
            const end = `${(endHour % 24).toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
            slots.push({ start, end });
        }
    }
    return slots;
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
    const ranges = player.availableTimeRanges;

    // If no specific ranges, no constraints
    if (ranges.length === 0) {
        return true;
    }

    // Compute overall window from all ranges
    const overallStart = Math.min(...ranges.map(r => timeToMinutes(r.start)));
    const overallEnd = Math.max(...ranges.map(r => timeToMinutes(r.end)));

    // Check overall window (for crossing slots, endMin might be 0, handle accordingly)
    const adjustedSlotEndMin = slotEndMin < slotStartMin ? slotEndMin + 1440 : slotEndMin;
    const adjustedOverallEnd = overallEnd < overallStart ? overallEnd + 1440 : overallEnd;
    if (slotStartMin < overallStart) {
        return false;
    }
    if (adjustedSlotEndMin > adjustedOverallEnd) {
        return false;
    }

    // Crossing slot = consider available (assumes ranges cover 00:00-23:59)
    if (slotEndMin < slotStartMin) {
        return true;
    }

    // Normal slot: calculate total minutes covered by availableTimeRanges
    let totalOverlap = 0;
    ranges.forEach(range => {
        const rangeStartMin = timeToMinutes(range.start);
        const rangeEndMin = timeToMinutes(range.end);
        const overlapStart = Math.max(slotStartMin, rangeStartMin);
        const overlapEnd = Math.min(slotEndMin, rangeEndMin);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        totalOverlap += overlap;
    });
    
    // Available if at least 10 minutes overlap
    return totalOverlap >= 10;
}




/**
 * Updates the schedule tables and waiting list in the UI.
 * Populates minister tables for days 1, 2, 4, 5 and noble advisor tables for the same days.
 * @param {Assignments} assignments - Object with day keys and role-specific appointment arrays.
 */
function updateScheduleTables(assignments) {
    const days = [1, 2, 4, 5];
    days.forEach(day => {
        if (assignments[day] && assignments[day].ministers) {
            assignments[day].ministers.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
            populateTable(`day${day}MinisterTable`, assignments[day].ministers);
        }
        if (assignments[day] && assignments[day].advisors) {
            assignments[day].advisors.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
            populateTable(`day${day}NobleTable`, assignments[day].advisors);
        }
        if (day !== 3) {
            const secondSectionId = day === 4 ? `day${day}MinisterSection` : `day${day}NobleSection`;
            const secondAppointments = day === 4 ? assignments[day].ministers : assignments[day].advisors;
            if (secondAppointments && secondAppointments.length === 0) {
                document.getElementById(secondSectionId).style.display = 'none';
            }
        }
    });
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

        appointments.forEach(appointment => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = `${appointment.start}–${appointment.end}`;
            const playerCell = row.insertCell(1);
            playerCell.textContent = `${appointment.alliance}/${appointment.player}`;
            // Add tooltip with detailed player info on hover
            const player = schedulerData.processedPlayers.find(p => p[PLAYER] === appointment.player && p[ALLIANCE] === appointment.alliance);
            if (player) {
                const timeSlots = player.availableTimeRanges && player.availableTimeRanges.length > 0
                    ? player.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ')
                    : 'No available ranges';
                playerCell.title = `${appointment.alliance}/${appointment.player} - T:${Math.round(player[SOLDIER_TRAINING])} C:${Math.round(player[CONSTRUCTION])} R:${Math.round(player[RESEARCH])} TG:${Math.round(player[TRUEGOLD_PIECES])} - Time Slots: ${timeSlots}`;
            } else {
                playerCell.title = 'Player details unavailable';
            }
            row.insertCell(2).textContent = appointment.speedups;
            if (!tableId.includes('Noble')) {
                row.insertCell(3).textContent = appointment.truegold;
            }
            
            // Actions Column
            const actionsCell = row.insertCell(tableId.includes('Noble') ? 3 : 4);
            
            // Reassign Button
            const reassignBtn = document.createElement('button');
            reassignBtn.className = 'btn btn-sm btn-outline-primary me-1';
            reassignBtn.textContent = '🔃';
            reassignBtn.onclick = () => openAssignmentModal(appointment.alliance, appointment.player, {
                day: day,
                role: role,
                existingSlotStart: appointment.start,
                existingSlotEnd: appointment.end
            });
            actionsCell.appendChild(reassignBtn);
            
            // Remove Button (X)
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger';
            removeBtn.innerHTML = '&#10060;'; // Unicode X
            removeBtn.title = 'Remove Assignment';
            removeBtn.onclick = () => removeAssignment(day, role, appointment.start, appointment.alliance, appointment.player);
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
            li.textContent = `${player.alliance}/${player.player} - T:${player.speedups.soldier} C:${player.speedups.construction} R:${player.speedups.research} TG:${player.truegold} - Time Slots: ${player.timeSlots} `;
            
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
 * Populates a daily waiting list section. Hides the entire section if the list is empty.
 * @param {number} day - The day number (1, 2, 4, or 5).
 * @param {Array<WaitingPlayer>} waiting - Array of waiting player objects for the day.
 */
function populateDailyWaitingList(day, waiting) {
    const section = document.getElementById(`day${day}WaitingSection`);
    const ol = document.getElementById(`day${day}WaitingList`);
    if (!section || !ol) return;
    
    ol.innerHTML = '';
    if (waiting.length === 0) {
        section.style.display = 'none';
    } else {
        section.style.display = 'block';
        waiting.forEach(player => {
            const li = document.createElement('li');
            li.className = 'mb-2';
            li.textContent = `${player.alliance}/${player.player} - T:${player.speedups.soldier} C:${player.speedups.construction} R:${player.speedups.research} TG:${player.truegold} - Time Slots: ${player.timeSlots} `;
            
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
            li.textContent = `${player[ALLIANCE]}/${player[PLAYER]} - T:${Math.round(player[SOLDIER_TRAINING])} C:${Math.round(player[CONSTRUCTION])} R:${Math.round(player[RESEARCH])} TG:${Math.round(player[TRUEGOLD_PIECES])} `;
            
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
 * @param {Array<string>} [errors=[]] - Array of error strings from parsing.
 */
function calculateScheduleData(players, errors = []) {
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
    // @ts-ignore
    schedulerData.errors = errors; // Store for immediate display

    // Allocate general speedups
    schedulerData.processedPlayers.forEach(allocateGeneralSpeedups);

    // Filter players based on minimum hours
    const filtered = schedulerData.processedPlayers.filter(player => (player[CONSTRUCTION] + player[RESEARCH] >= minHours) || (player[SOLDIER_TRAINING] >= minHours));
    schedulerData.filteredOut = schedulerData.processedPlayers.filter(player => !filtered.includes(player));

    // Initialize assignments and tracking
    schedulerData.assignments = { 1: {ministers: [], advisors: []}, 2: {ministers: [], advisors: []}, 3: {ministers: [], advisors: []}, 4: {ministers: [], advisors: []}, 5: {ministers: [], advisors: []} };
    schedulerData.constructionAssignments = {};
    schedulerData.researchAssignments = {};
    schedulerData.trainingAssignments = {};
    filtered.forEach(player => {
        const playerId = `${player[PLAYER]}-${player[ALLIANCE]}`;
        if (player[CONSTRUCTION] + player[RESEARCH] >= minHours) {
            schedulerData.constructionAssignments[playerId] = false;
            schedulerData.researchAssignments[playerId] = false;
        }
        if (player[SOLDIER_TRAINING] >= minHours) {
            schedulerData.trainingAssignments[playerId] = false;
        }
    });
    // Initialize waiting lists
    schedulerData.waitingLists = { 1: [], 2: [], 4: [], 5: [] };

    // Calculate spillover day (the day in [1,2,5] that is not constructDay or researchDay)
    const spilloverDay = [1, 2, 5].find(d => d !== constructDay && d !== researchDay);

    // Construction buff assignment (Initial Two-Round)
    const constructionList = filtered.filter(player => player[CONSTRUCTION] >= minHours);
    assignInitialMinisters(constructDay, constructionList, CONSTRUCTION, 'constructionAssignments', schedulerData);

    // Research buff assignment (Initial Two-Round)
    const researchList = filtered.filter(player => player[RESEARCH] >= minHours);
    assignInitialMinisters(researchDay, researchList, RESEARCH, 'researchAssignments', schedulerData);

    // Advisor assignment for Day 4 (Two Stages, Two Rounds each)
    const trainingList = filtered.filter(player => player[SOLDIER_TRAINING] >= minHours);
    scheduleTrainingDay(trainingList, minHours, schedulerData);

    // Assign spillover candidates to spillover day
    scheduleSpilloverDay(schedulerData, spilloverDay);

    validateAndAssignUnassignedPlayers(schedulerData, minHours, spilloverDay);
}

/**
 * Validates that all processed players are either assigned, on a waiting list, or filtered out.
 * Adds qualifying unassigned players to appropriate waiting lists and schedules leftover unassigned players via spillover day.
 * @param {SchedulerData} schedulerData - Main data object.
 * @param {number} minHours - Minimum hours threshold.
 * @param {number} spilloverDay - The spillover day to add players to for general access.
 */
function validateAndAssignUnassignedPlayers(schedulerData, minHours, spilloverDay) {
    /** @type {Array<WaitingPlayer>} */
    const unassignedForSpillover = [];
    const allAppointments = Object.values(schedulerData.assignments).flatMap(day => day.ministers.concat(day.advisors));

    schedulerData.processedPlayers.forEach(player => {
        const alliance = player[ALLIANCE];
        const playerName = player[PLAYER];
        const playerId = `${playerName}-${alliance}`;

        const isAssigned = allAppointments.some(app => app.alliance === alliance && app.player === playerName);
        if (isAssigned) return;

        // Check if player is on any waiting list
        let isOnAnyWaitingList = false;
        Object.values(schedulerData.waitingLists).forEach(list => {
            if (list.some(w => w.alliance === alliance && w.player === playerName)) {
                isOnAnyWaitingList = true;
            }
        });
        if (isOnAnyWaitingList) return;

        const isFilteredOut = schedulerData.filteredOut.some(f => f[ALLIANCE] === alliance && f[PLAYER] === playerName);
        if (isFilteredOut) return;

        const totalSpeedups = getAllSpeedupsSum(player);
        console.error(`Unassigned player ${alliance}/${playerName} (total speedups: ${totalSpeedups}) not found in assignments, waiting lists, or filtered out.`);

        if (totalSpeedups >= minHours) {
            const waitingPlayer = {
                alliance: alliance,
                player: playerName,
                speedups: {
                    soldier: Math.round(player[SOLDIER_TRAINING]),
                    construction: Math.round(player[CONSTRUCTION]),
                    research: Math.round(player[RESEARCH])
                },
                truegold: Math.round(player[TRUEGOLD_PIECES]),
                timeSlots: player.availableTimeRanges.length > 0
                    ? player.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ')
                    : 'No available ranges'
            };

            let addedToOtherDay = false;
            // Add to waiting lists for which the player qualifies
            if (player[CONSTRUCTION] >= minHours) {
                schedulerData.waitingLists[schedulerData.constructionKingDay].push({ ...waitingPlayer });
                addedToOtherDay = true;
            }
            if (player[RESEARCH] >= minHours) {
                schedulerData.waitingLists[schedulerData.researchKingDay].push({ ...waitingPlayer });
                addedToOtherDay = true;
            }
            if (player[SOLDIER_TRAINING] >= minHours) {
                schedulerData.waitingLists[4].push({ ...waitingPlayer });
                addedToOtherDay = true;
            }
            // Collector for spillover scheduling
            unassignedForSpillover.push({ ...waitingPlayer });
        } else {
            schedulerData.filteredOut.push(player);
        }
    });

    // Schedule collected unassigned players via spillover
    scheduleSpilloverDay(schedulerData, spilloverDay, unassignedForSpillover);
}

/**
 * Renders the UI based on the provided scheduler data.
 * @param {SchedulerData} data - The data to render.
 * @param {boolean} [scrollToTop=false] - Whether to scroll to the top of Day 1 section.
 * @param {Array<string>} [errors=[]] - Array of error strings to display.
 */
/**
 * Updates the speedups column headers for all minister tables dynamically based on schedule roles.
 * Called once per renderUI to batch-update headers before table population.
 * @param {SchedulerData} schedulerData - The current schedule data.
 */
function updateMinisterSpeedupsHeaders(schedulerData) {
    if (!schedulerData || !schedulerData.constructionKingDay || !schedulerData.researchKingDay) {
        console.warn('schedulerData not loaded; skipping minister header updates.');
        return;
    }
    // Calculate spillover day dynamically (matches calculateScheduleData)
    const spilloverDay = [1, 2, 5].find(d => d !== schedulerData.constructionKingDay && d !== schedulerData.researchKingDay);

    // Loop over minister table days and update headers
    [1, 2, 4, 5].forEach(d => {
        try {
            const speedupsHeaderId = `day${d}-minister-speedups-header`;
            const headerElement = document.getElementById(speedupsHeaderId);
            if (headerElement) {  // Exists in HTML
                if (d === schedulerData.constructionKingDay) {
                    headerElement.textContent = 'Construction';
                } else if (d === schedulerData.researchKingDay) {
                    headerElement.textContent = 'Research';
                } else if (d === 4) {
                    headerElement.textContent = 'Training';
                } else if (d === spilloverDay) {
                    headerElement.textContent = 'Construction / Research / Training';
                }
                // No match: Leave as HTML default ('Speedups Cn/Rs')
            }
        } catch (error) {
            console.error(`Failed to update speedups header for day ${d}:`, error);
        }
    });
}

function renderUI(data, scrollToTop = false, errors = []) {
    updateMinisterSpeedupsHeaders(data);
    populateDebugTable(data.rawPlayers);
    updateScheduleTables(data.assignments);
    updateFilteredList(data.filteredOut);
    document.querySelectorAll('.day-section').forEach(el => el.style.display = 'block');

    // Populate daily waiting lists
    Object.entries(data.waitingLists).forEach(([day, players]) => {
        populateDailyWaitingList(parseInt(day), players);
    });

    const errorBox = document.getElementById('errorBox');
    // @ts-ignore
    const dataErrors = data.errors || [];
    const allErrors = errors.concat(dataErrors);
    // Deduplicate
    const uniqueErrors = [...new Set(allErrors)];
    
    if (uniqueErrors.length > 0) {
        errorBox.innerHTML = '<h4>CSV Parsing Errors:</h4><ol>' + uniqueErrors.map(e => '<li>' + e + '</li>').join('') + '</ol>';
        errorBox.classList.remove('d-none');
        errorBox.style.display = 'block';
    } else {
        errorBox.style.display = 'none';
        errorBox.classList.add('d-none');
    }

    if (scrollToTop) {
        document.getElementById('day1HeadingWrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    document.getElementById('loadingIndicator').style.display = 'none';
}

/**
 * Processes players, allocates speedups, filters, creates lists, and schedules appointments.
 * @param {Array<PlayerObject>} players - Array of player objects from CSV.
 * @param {Array<string>} [errors=[]] - Parsing errors.
 */
async function processAndSchedule(players, errors = []) {
    calculateScheduleData(players, errors);
    try {
        await saveSchedulerData(schedulerData);
    } catch (e) {
        console.error("Failed to save scheduler data to storage", e);
    }
    renderUI(schedulerData, false, errors);
}



/**
 * Loads the scheduler system with the provided data.
 * Populates the internal state and updates the UI.
 * @param {SchedulerData} data - The scheduler data to load.
 */
function loadSchedulerSystem(data) {
    // Update global state
    Object.assign(schedulerData, data);

    // Migration for new assignment maps if missing
    if (!schedulerData.constructionAssignments) schedulerData.constructionAssignments = {};
    if (!schedulerData.researchAssignments) schedulerData.researchAssignments = {};
    if (!schedulerData.trainingAssignments) schedulerData.trainingAssignments = {};

    // Map old playerAssignments if present and new maps are empty
    // @ts-ignore
    if (data.playerAssignments && Object.keys(schedulerData.constructionAssignments).length === 0) {
        // @ts-ignore
        for (const [id, flags] of Object.entries(data.playerAssignments)) {
             // @ts-ignore
             if (flags.ministerAssigned) {
                 schedulerData.constructionAssignments[id] = true;
                 schedulerData.researchAssignments[id] = true;
             }
             // @ts-ignore
             if (flags.advisorAssigned) {
                 schedulerData.trainingAssignments[id] = true;
             }
        }
    }

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
            // Reset error box
            const errorBox = document.getElementById('errorBox');
            if (errorBox) {
                errorBox.style.display = 'none';
                errorBox.classList.add('d-none');
                errorBox.innerHTML = '';
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const csvText = e.target.result;
                const { players, errors } = parseCsvToObjects(csvText);
                // Process and schedule
                processAndSchedule(players, errors);
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
    const minHours = schedulerData.minHours;

    // @ts-ignore
    if (newPlayer[CONSTRUCTION] + newPlayer[RESEARCH] >= minHours) {
        schedulerData.constructionAssignments[playerId] = false;
        schedulerData.researchAssignments[playerId] = false;
    }
    // @ts-ignore
    if (newPlayer[SOLDIER_TRAINING] >= minHours) {
        schedulerData.trainingAssignments[playerId] = false;
    }

    // 2. Filter Check
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
    if (newPlayer[CONSTRUCTION] >= minHours && !schedulerData.constructionAssignments[playerId]) {
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
                schedulerData.constructionAssignments[playerId] = true;
                assignmentsMade.push({ day: constructDay, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                break;
            }
        }
    }
    // Fallback to other days in 1,2,5
    if (!schedulerData.constructionAssignments[playerId]) {
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
                    schedulerData.constructionAssignments[playerId] = true;
                    assignmentsMade.push({ day: day, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                    break;
                }
            }
            if (schedulerData.constructionAssignments[playerId]) break;
        }
    }

    // Attempt Research buff
    if (newPlayer[RESEARCH] >= minHours && !schedulerData.researchAssignments[playerId]) {
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
                schedulerData.researchAssignments[playerId] = true;
                assignmentsMade.push({ day: researchDay, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                break;
            }
        }
        // Fallback to other days in 1,2,5
        if (!schedulerData.researchAssignments[playerId]) {
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
                        schedulerData.researchAssignments[playerId] = true;
                        assignmentsMade.push({ day: day, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                        break;
                    }
                }
                if (schedulerData.researchAssignments[playerId]) break;
            }
        }
    }

    // Attempt Advisor (Day 4)
    if (newPlayer[SOLDIER_TRAINING] >= minHours && !schedulerData.trainingAssignments[playerId]) {
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
                schedulerData.trainingAssignments[playerId] = true;
                assignmentsMade.push({ day: day, role: 'advisors', slotStr: `${slot.start}-${slot.end}` });
                assigned = true;
                break;
              }
        }

        // Overflow to Chief Minister if needed and not already assigned to research
        if (!assigned && !schedulerData.researchAssignments[playerId]) {
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
                      schedulerData.researchAssignments[playerId] = true; // Sets research assignment only
                      assignmentsMade.push({ day: 4, role: 'ministers', slotStr: `${slot.start}-${slot.end}` });
                      assigned = true;
                      break;
                  }
              }
        }
    }
    
    // 4. Finalize
    if (assignmentsMade.length === 0) {
        const waitingPlayer = {
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
        };
        // Add to all waiting lists for which the player qualifies
        // @ts-ignore
        if (newPlayer[CONSTRUCTION] >= minHours) {
            schedulerData.waitingLists[schedulerData.constructionKingDay].push({ ...waitingPlayer });
        }
        // @ts-ignore
        if (newPlayer[RESEARCH] >= minHours) {
            schedulerData.waitingLists[schedulerData.researchKingDay].push({ ...waitingPlayer });
        }
        // @ts-ignore
        if (newPlayer[SOLDIER_TRAINING] >= minHours) {
            schedulerData.waitingLists[4].push({ ...waitingPlayer });
        }
        // Always add to spillover day waiting list
        const spilloverDay = [1, 2, 5].find(d => d !== schedulerData.constructionKingDay && d !== schedulerData.researchKingDay);
        schedulerData.waitingLists[spilloverDay].push({ ...waitingPlayer });
        finishManagementAction("Player added to Waiting Lists (no slots found).");
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
    
    // Remove from all daily waiting lists
    Object.keys(schedulerData.waitingLists).forEach(day => {
        schedulerData.waitingLists[day] = schedulerData.waitingLists[day].filter(p => `${p.player}-${p.alliance}` !== idToRemove);
    });
    
    // 2. Remove from assignments
    [1, 2, 3, 4, 5].forEach(day => {
        schedulerData.assignments[day].ministers = schedulerData.assignments[day].ministers.filter(a => `${a.player}-${a.alliance}` !== idToRemove);
        schedulerData.assignments[day].advisors = schedulerData.assignments[day].advisors.filter(a => `${a.player}-${a.alliance}` !== idToRemove);
    });
    
    // 3. Remove from assignment tracking
    delete schedulerData.constructionAssignments[idToRemove];
    delete schedulerData.researchAssignments[idToRemove];
    delete schedulerData.trainingAssignments[idToRemove];
    
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
 * Opens the messages modal for a given day and role.
 * @param {number} day - Day number (1-5)
 * @param {string} role - 'ministers' or 'advisors'
 */
function openMessagesModal(day, role) {
    const titleText = `Day ${day} ${role === 'ministers' ? 'Chief Minister' : 'Noble Advisor'} Messages`;
    document.getElementById('messagesModalTitle').textContent = titleText;

    const content = document.getElementById('messagesContent');
    content.innerHTML = '';

    const assignments = schedulerData.assignments[day][role];
    if (assignments.length === 0) {
        content.innerHTML = '<p>No assignments to display.</p>';
        // @ts-ignore
        new bootstrap.Modal(document.getElementById('messagesModal')).show();
        return;
    }

    // Build list of "Alliance/Player" strings
    const lines = assignments.map(app => `${app.start} ${app.alliance}/${app.player}`);

    // Group into blocks <500 chars
    const blocks = [];
    let currentBlock = '';
    lines.forEach(line => {
        const lineWithNewline = line + '\n';
        const newLength = currentBlock.length + lineWithNewline.length;
        if (newLength > 499) {
            if (currentBlock.length > 0) {
                blocks.push(currentBlock.trimEnd()); // trim trailing newline
                currentBlock = lineWithNewline;
            } else {
                // First line in new block
                currentBlock = lineWithNewline;
            }
        } else {
            currentBlock += lineWithNewline;
        }
    });
    if (currentBlock.length > 0) {
        blocks.push(currentBlock.trimEnd());
    }

    // Create divs for each block
    blocks.forEach(block => {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'border p-3 mb-3';
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        const preCol = document.createElement('div');
        preCol.className = 'col';
        const pre = document.createElement('pre');
        pre.textContent = block.replace(/\n/g, '\n'); // Ensure newlines
        preCol.appendChild(pre);
        const btnCol = document.createElement('div');
        btnCol.className = 'col-auto text-end d-flex align-items-start';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-sm';
        copyBtn.innerHTML = '📋';
        copyBtn.onclick = () => copyToClipboard(block);
        btnCol.appendChild(copyBtn);
        rowDiv.appendChild(preCol);
        rowDiv.appendChild(btnCol);
        blockDiv.appendChild(rowDiv);
        content.appendChild(blockDiv);
    });

    // @ts-ignore
    new bootstrap.Modal(document.getElementById('messagesModal')).show();
}

/**
 * Copies the provided encoded text to clipboard.
 * @param {string} encodedText - Base64 encoded text
 */
function copyToClipboard(encodedText) {
    const text = encodedText;
    navigator.clipboard.writeText(text).catch(e => alert('Copy failed: ' + e.message));
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
    // If Assigning from list, remove from waiting lists/filtered
    else {
        Object.keys(schedulerData.waitingLists).forEach(day => {
            schedulerData.waitingLists[day] = schedulerData.waitingLists[day].filter(p => !(`${p.player}-${p.alliance}` === targetId));
        });
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
    const constructDay = schedulerData.constructionKingDay;
    const researchDay = schedulerData.researchKingDay;

    if (day === 3 && role === 'ministers') {
        schedulerData.constructionAssignments[targetId] = true;
        schedulerData.researchAssignments[targetId] = true;
        schedulerData.trainingAssignments[targetId] = true;
    } else if (day === constructDay && role === 'ministers') {
        schedulerData.constructionAssignments[targetId] = true;
    } else if ((day === researchDay || day === 4) && role === 'ministers') {
        schedulerData.researchAssignments[targetId] = true;
    } else if (day === 4 && role === 'advisors') {
        schedulerData.trainingAssignments[targetId] = true;
    } else {
        // Fallback for non-king days (1, 2, 5) if they aren't covered above
        // If assigned to a minister role, assume construction or research?
        // Let's set construction if it's available, otherwise research.
        // Or better: don't set a specific purpose flag if it's "generic", but wait...
        // The prompt implies strict purpose mapping.
        // If I assign to Day 5 and it's not a king day, it's still a minister slot.
        // Users might use it for construction or research. 
        // Let's check which flag is false and set it?
        if (!schedulerData.constructionAssignments[targetId]) {
             schedulerData.constructionAssignments[targetId] = true;
        } else {
             schedulerData.researchAssignments[targetId] = true;
        }
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
    
    const id = `${player}-${alliance}`;
    const constructDay = schedulerData.constructionKingDay;
    const researchDay = schedulerData.researchKingDay;

    // Helper to check assignment
    const hasAssig = (d, r) => schedulerData.assignments[d] && schedulerData.assignments[d][r].some(a => a.alliance === alliance && a.player === player);

    const hasDay3 = hasAssig(3, 'ministers');
    const hasDay4Minister = hasAssig(4, 'ministers');
    const hasDay4Advisor = hasAssig(4, 'advisors');
    const hasConstructKing = hasAssig(constructDay, 'ministers');
    const hasResearchKing = hasAssig(researchDay, 'ministers');

    // Base flags
    let isConstr = hasConstructKing || hasDay3;
    let isRes = hasResearchKing || hasDay4Minister || hasDay3;
    let isTrain = hasDay4Advisor || hasDay3;

    // Handle "Other" days (1, 2, 5 non-king)
    // Iterate them to mimic allocation logic
    const otherDays = [1, 2, 5].filter(d => d !== constructDay && d !== researchDay);
    otherDays.forEach(d => {
        if (hasAssig(d, 'ministers')) {
            if (!isConstr) isConstr = true;
            else isRes = true;
        }
    });

    schedulerData.constructionAssignments[id] = isConstr;
    schedulerData.researchAssignments[id] = isRes;
    schedulerData.trainingAssignments[id] = isTrain;

    // Add back to waiting list if completely unassigned?
    // Check if any assignment remains
    const hasAny = isConstr || isRes || isTrain;

    if (!hasAny) {
        // Re-construct waiting entry and add to all qualifying waiting lists
        const p = schedulerData.processedPlayers.find(pl => pl.alliance === alliance && pl.player === player);
        if (p) {
            const waitingPlayer = {
                alliance: p[ALLIANCE],
                player: p[PLAYER],
                speedups: {
                    soldier: Math.round(p[SOLDIER_TRAINING]),
                    construction: Math.round(p[CONSTRUCTION]),
                    research: Math.round(p[RESEARCH])
                },
                truegold: Math.round(p[TRUEGOLD_PIECES]),
                timeSlots: p.availableTimeRanges.map(r => `${r.start}-${r.end}`).join(', ') || 'No available ranges'
            };
            // Add to all waiting lists for which the player qualifies
            if (p[CONSTRUCTION] >= schedulerData.minHours) {
                schedulerData.waitingLists[schedulerData.constructionKingDay].push({ ...waitingPlayer });
            }
            if (p[RESEARCH] >= schedulerData.minHours) {
                schedulerData.waitingLists[schedulerData.researchKingDay].push({ ...waitingPlayer });
            }
            if (p[SOLDIER_TRAINING] >= schedulerData.minHours) {
                schedulerData.waitingLists[4].push({ ...waitingPlayer });
            }
            // Always add to spillover day waiting list
            const spilloverDay = [1, 2, 5].find(d => d !== schedulerData.constructionKingDay && d !== schedulerData.researchKingDay);
            schedulerData.waitingLists[spilloverDay].push({ ...waitingPlayer });
        }
    }

    finishManagementAction(`Removed assignment for ${alliance}/${player}.`);
}