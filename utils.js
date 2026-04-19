/**
 * Clones a template element and appends it to a parent element.
 * The template must contain a single wrapper element (typically a DIV) as its first child.
 * Captures reference to the first child before the DocumentFragment is emptied.
 * @param {string} templateId - The ID of the template element to clone.
 * @param {string} parentId - The ID of the parent element to append the clone to.
 * @returns {Element|null} Reference to the first child element of the cloned template, or null if template or parent not found.
 */
function instantiateTemplate(templateId, parentId) {
    const template = document.getElementById(templateId);
    const parent = document.getElementById(parentId);

    if (!template || template.tagName !== 'TEMPLATE') {
        console.error('Template not found or invalid:', templateId);
        return null;
    }

    if (!parent) {
        console.error('Parent element not found:', parentId);
        return null;
    }

    const fragment = template.content.cloneNode(true);
    const firstChild = fragment.firstElementChild;

    if (!firstChild) {
        console.error('Template has no child elements:', templateId);
        return null;
    }

    parent.appendChild(fragment);

    return firstChild;
}

/**
 * Formats a player's speedups and truegold into a display string.
 * Handles both PlayerObject (e.g. processedPlayers) and WaitingPlayer shapes.
 * @param {Object} player - Player object (PlayerObject or WaitingPlayer).
 * @returns {string} Formatted string like "T:5 C:3 R:10 TG:2".
 */
function formatPlayerSpeedups(player) {
    if (player.speedups && typeof player.speedups === 'object') {
        return `T:${player.speedups.soldier} C:${player.speedups.construction} R:${player.speedups.research} TG:${player.truegold}`;
    }
    return `T:${Math.round(player[SOLDIER_TRAINING])} C:${Math.round(player[CONSTRUCTION])} R:${Math.round(player[RESEARCH])} TG:${Math.round(player[TRUEGOLD_PIECES])}`;
}
