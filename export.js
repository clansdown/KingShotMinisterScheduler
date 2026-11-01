/**
 * Creates a modal element for the export.
 * @param {string} modalId - The modal ID.
 * @param {string} title - The modal title.
 * @param {string} contentHTML - The HTML content for the modal body.
 * @returns {HTMLElement} The modal element.
 */
function createExportModal(modalId, title, contentHTML) {
    var modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = modalId;
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-hidden', 'true');

    var dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-lg';

    var content = document.createElement('div');
    content.className = 'modal-content';

    var header = document.createElement('div');
    header.className = 'modal-header';

    var titleEl = document.createElement('h5');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-close';
    closeBtn.setAttribute('data-bs-dismiss', 'modal');
    closeBtn.setAttribute('aria-label', 'Close');

    var body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = contentHTML;

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    content.appendChild(header);
    content.appendChild(body);
    dialog.appendChild(content);
    modal.appendChild(dialog);

    return modal;
}

/**
 * Exports all scheduler tables and waiting lists to a standalone HTML file.
 */
function exportToHtml() {
    var appointmentsContent = document.getElementById('appointmentsContent');
    if (!appointmentsContent) {
        alert('No appointments to export. Please process a CSV file first.');
        return;
    }

    var clone = appointmentsContent.cloneNode(true);

    // Remove Day 5 section if spillover generation was disabled and Day 5 is the spillover day
    var day5Section = clone.querySelector('#day5Section');
    if (day5Section && schedulerData.constructionKingDay !== 5 && schedulerData.researchKingDay !== 5 && !schedulerData.generateDay5Assignment) {
        day5Section.remove();
    }

    // Remove Day 4 Chief Minister section if its generation was disabled
    var day4MinisterSection = clone.querySelector('#day4MinisterSection');
    if (day4MinisterSection && !schedulerData.generateDay4Ministers) {
        day4MinisterSection.remove();
    }

    var dayContents = clone.querySelectorAll('.day-content');
    dayContents.forEach(function(el) {
        el.style.display = '';
    });

    var daySections = clone.querySelectorAll('.day-section');
    daySections.forEach(function(el) {
        el.style.display = '';
    });

    // Strip title tooltips
    var titledElements = clone.querySelectorAll('[title]');
    titledElements.forEach(function(el) {
        el.removeAttribute('title');
    });

    var toggleButtons = clone.querySelectorAll('button[id^="toggleDay"]');
    toggleButtons.forEach(function(btn) {
        btn.textContent = 'Collapse';
    });

    // Keep only Appointment Time and Alliance/Player columns
    var tables = clone.querySelectorAll('table');
    tables.forEach(function(table) {
        // Remove header columns after column 1
        var headerRow = table.querySelector('thead tr');
        if (headerRow) {
            var headers = headerRow.querySelectorAll('th');
            for (var i = headers.length - 1; i >= 2; i--) {
                headers[i].remove();
            }
        }

        // Remove body columns after column 1
        var bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(function(row) {
            var cells = row.querySelectorAll('td');
            for (var i = cells.length - 1; i >= 2; i--) {
                cells[i].remove();
            }
        });
    });

    // Simplify waiting list entries to just [Alliance]Player
    var waitingLists = clone.querySelectorAll('ol[id$="WaitingList"]');
    waitingLists.forEach(function(list) {
        var items = list.querySelectorAll('li');
        items.forEach(function(li) {
            var text = li.textContent.trim();
            // Extract just [Alliance]Player (before " - ")
            var dashIndex = text.indexOf(' - ');
            if (dashIndex > 0) {
                text = text.substring(0, dashIndex);
            }
            // Remove all child elements (buttons)
            while (li.firstChild) {
                li.removeChild(li.firstChild);
            }
            li.textContent = text;
        });
    });

    var waitingSections = clone.querySelectorAll('[id$="WaitingSection"]');
    waitingSections.forEach(function(section) {
        if (section.style.display === 'none') {
            section.style.display = 'block';
        }
    });

    // Day 1 Minister button
    var btn = clone.querySelector('button[onclick="openMessagesModal(1, \'ministers\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day1MinisterMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 1 Advisor button
    btn = clone.querySelector('button[onclick="openMessagesModal(1, \'advisors\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day1AdvisorMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 2 Minister button
    btn = clone.querySelector('button[onclick="openMessagesModal(2, \'ministers\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day2MinisterMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 2 Advisor button
    btn = clone.querySelector('button[onclick="openMessagesModal(2, \'advisors\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day2AdvisorMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 4 Minister button
    btn = clone.querySelector('button[onclick="openMessagesModal(4, \'ministers\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day4MinisterMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 4 Advisor button
    btn = clone.querySelector('button[onclick="openMessagesModal(4, \'advisors\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day4AdvisorMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 5 Minister button
    btn = clone.querySelector('button[onclick="openMessagesModal(5, \'ministers\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day5MinisterMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 5 Advisor button
    btn = clone.querySelector('button[onclick="openMessagesModal(5, \'advisors\')"]');
    if (btn) {
        btn.setAttribute('data-bs-toggle', 'modal');
        btn.setAttribute('data-bs-target', '#day5AdvisorMessagesModal');
        btn.removeAttribute('onclick');
    }

    // Day 1 modals
    var day1Section = clone.querySelector('#day1Section');
    if (day1Section) {
        if (schedulerData.assignments[1] && schedulerData.assignments[1].ministers && schedulerData.assignments[1].ministers.length > 0) {
            var modal = createExportModal(
                'day1MinisterMessagesModal',
                'Day 1 Chief Minister Messages',
                buildMessageBlocksHTML(schedulerData.assignments[1].ministers)
            );
            day1Section.insertAdjacentElement('afterend', modal);
        }
        if (schedulerData.assignments[1] && schedulerData.assignments[1].advisors && schedulerData.assignments[1].advisors.length > 0) {
            var modal = createExportModal(
                'day1AdvisorMessagesModal',
                'Day 1 Noble Advisor Messages',
                buildMessageBlocksHTML(schedulerData.assignments[1].advisors)
            );
            day1Section.insertAdjacentElement('afterend', modal);
        }
    }

    // Day 2 modals
    var day2Section = clone.querySelector('#day2Section');
    if (day2Section) {
        if (schedulerData.assignments[2] && schedulerData.assignments[2].ministers && schedulerData.assignments[2].ministers.length > 0) {
            var modal = createExportModal(
                'day2MinisterMessagesModal',
                'Day 2 Chief Minister Messages',
                buildMessageBlocksHTML(schedulerData.assignments[2].ministers)
            );
            day2Section.insertAdjacentElement('afterend', modal);
        }
        if (schedulerData.assignments[2] && schedulerData.assignments[2].advisors && schedulerData.assignments[2].advisors.length > 0) {
            var modal = createExportModal(
                'day2AdvisorMessagesModal',
                'Day 2 Noble Advisor Messages',
                buildMessageBlocksHTML(schedulerData.assignments[2].advisors)
            );
            day2Section.insertAdjacentElement('afterend', modal);
        }
    }

    // Day 4 modals
    var day4Section = clone.querySelector('#day4Section');
    if (day4Section) {
        if (schedulerData.assignments[4] && schedulerData.assignments[4].ministers && schedulerData.assignments[4].ministers.length > 0) {
            var modal = createExportModal(
                'day4MinisterMessagesModal',
                'Day 4 Chief Minister Messages',
                buildMessageBlocksHTML(schedulerData.assignments[4].ministers)
            );
            day4Section.insertAdjacentElement('afterend', modal);
        }
        if (schedulerData.assignments[4] && schedulerData.assignments[4].advisors && schedulerData.assignments[4].advisors.length > 0) {
            var modal = createExportModal(
                'day4AdvisorMessagesModal',
                'Day 4 Noble Advisor Messages',
                buildMessageBlocksHTML(schedulerData.assignments[4].advisors)
            );
            day4Section.insertAdjacentElement('afterend', modal);
        }
    }

    // Day 5 modals
    var day5Section = clone.querySelector('#day5Section');
    if (day5Section) {
        if (schedulerData.assignments[5] && schedulerData.assignments[5].ministers && schedulerData.assignments[5].ministers.length > 0) {
            var modal = createExportModal(
                'day5MinisterMessagesModal',
                'Day 5 Chief Minister Messages',
                buildMessageBlocksHTML(schedulerData.assignments[5].ministers)
            );
            day5Section.insertAdjacentElement('afterend', modal);
        }
        if (schedulerData.assignments[5] && schedulerData.assignments[5].advisors && schedulerData.assignments[5].advisors.length > 0) {
            var modal = createExportModal(
                'day5AdvisorMessagesModal',
                'Day 5 Noble Advisor Messages',
                buildMessageBlocksHTML(schedulerData.assignments[5].advisors)
            );
            day5Section.insertAdjacentElement('afterend', modal);
        }
    }

    // Build the day navigation links from the day sections present in the clone
    var dayLinks = '';
    [1, 2, 4, 5].forEach(function(dayNum) {
        if (clone.querySelector('#day' + dayNum + 'Section')) {
            dayLinks += '    <a class="btn btn-sm btn-outline-primary" href="#day' + dayNum + 'Section">Day ' + dayNum + '</a>\n';
        }
    });

    // Build the Alliance filter options from alliances actually present in the export
    var allianceOptions = '    <option value="All" selected>All</option>\n';
    var seenAlliances = {};
    function addExportAlliance(allianceName) {
        if (!allianceName || seenAlliances[allianceName]) return;
        seenAlliances[allianceName] = true;
        var escapedAlliance = String(allianceName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        allianceOptions += '    <option value="' + escapedAlliance + '">' + escapedAlliance + '</option>\n';
    }
    clone.querySelectorAll('table tbody tr td:nth-child(2)').forEach(function(cell) {
        var match = cell.textContent.trim().match(/^\[([^\]]+)\]/);
        if (match) addExportAlliance(match[1]);
    });
    clone.querySelectorAll('ol[id$="WaitingList"] li').forEach(function(item) {
        var match = item.textContent.trim().match(/^\[([^\]]+)\]/);
        if (match) addExportAlliance(match[1]);
    });

    // Collect full line data per message modal so copy text can be recalculated per alliance
    var exportMessageData = {};
    function addExportMessageData(dayNum, role) {
        var appointments = schedulerData.assignments[dayNum] && schedulerData.assignments[dayNum][role];
        if (appointments && appointments.length > 0) {
            var modalId = 'day' + dayNum + (role === 'ministers' ? 'Minister' : 'Advisor') + 'MessagesModal';
            exportMessageData[modalId] = appointments.map(function(appointment) {
                return appointment.start + ' [' + appointment.alliance + ']' + appointment.player;
            });
        }
    }
    addExportMessageData(1, 'ministers');
    addExportMessageData(1, 'advisors');
    addExportMessageData(2, 'ministers');
    addExportMessageData(2, 'advisors');
    addExportMessageData(4, 'ministers');
    addExportMessageData(4, 'advisors');
    addExportMessageData(5, 'ministers');
    addExportMessageData(5, 'advisors');

    var navHTML = '<nav id="exportHeaderNav" class="sticky-top border-bottom py-2" style="background-color: var(--bs-body-bg); z-index: 3;">\n' +
        '    <div class="container-fluid d-flex flex-wrap align-items-center gap-2">\n' +
        '        <strong class="me-1">Jump to:</strong>\n' +
        dayLinks +
        '        <span class="ms-auto d-flex align-items-center gap-2">\n' +
        '            <label class="form-label mb-0" for="exportAllianceFilter">Alliance</label>\n' +
        '            <select id="exportAllianceFilter" class="form-select form-select-sm" style="width: auto;" onchange="applyAllianceFilter()">\n' +
        allianceOptions +
        '            </select>\n' +
        '        </span>\n' +
        '    </div>\n' +
        '</nav>\n';

    var inlineStyles = '<style>\n' +
        'html { scroll-behavior: smooth; }\n' +
        'body { font-family: Arial, sans-serif; margin: 20px; }\n' +
        '.day-section { margin-bottom: 30px; scroll-margin-top: 72px; }\n' +
        'thead th {\n' +
        '    position: sticky;\n' +
        '    top: 56px;\n' +
        '    background-color: var(--bs-body-bg);\n' +
        '    z-index: 1;\n' +
        '}\n' +
        '.message-block { cursor: pointer; }\n' +
        '</style>\n';

    var exportJS = '<script>\n' +
        'var EXPORT_MESSAGE_DATA = ' + JSON.stringify(exportMessageData).replace(/<\//g, '<\\/') + ';\n' +
        'function escapeAttr(text) {\n' +
        '    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");\n' +
        '}\n' +
        'function chunkLines(lines) {\n' +
        '    var blocks = [];\n' +
        '    var currentBlock = "";\n' +
        '    var currentBlockLineCount = 0;\n' +
        '    lines.forEach(function(line) {\n' +
        '        var lineWithNewline = line + "\\n";\n' +
        '        var wouldExceedLineLimit = (currentBlockLineCount + 1) > 10;\n' +
        '        var wouldExceedCharLimit = (currentBlock.length + lineWithNewline.length) > 499;\n' +
        '        if (currentBlock.length > 0 && (wouldExceedLineLimit || wouldExceedCharLimit)) {\n' +
        '            blocks.push(currentBlock.trimEnd());\n' +
        '            currentBlock = lineWithNewline;\n' +
        '            currentBlockLineCount = 1;\n' +
        '        } else if (currentBlock.length === 0 && wouldExceedCharLimit) {\n' +
        '            currentBlock = lineWithNewline;\n' +
        '            currentBlockLineCount = 1;\n' +
        '        } else {\n' +
        '            currentBlock += lineWithNewline;\n' +
        '            currentBlockLineCount++;\n' +
        '        }\n' +
        '    });\n' +
        '    if (currentBlock.length > 0) blocks.push(currentBlock.trimEnd());\n' +
        '    return blocks;\n' +
        '}\n' +
        'function renderMessageBlocksHTML(lines) {\n' +
        '    if (lines.length === 0) return "<p>No assignments to display.</p>";\n' +
        '    var html = "";\n' +
        '    chunkLines(lines).forEach(function(block) {\n' +
        '        var escapedText = escapeAttr(block);\n' +
        '        html += \'<div class="message-block" data-text="\' + escapedText + \'">\';\n' +
        '        html += \'<div class="border p-3 mb-3"><div class="row"><div class="col"><pre>\' + escapedText + \'</pre></div>\';\n' +
        '        html += \'<div class="col-auto text-end d-flex align-items-start">\';\n' +
        '        html += \'<button class="btn btn-sm" onclick="copyExportMessage(this)">📋</button>\';\n' +
        '        html += \'</div></div></div></div>\';\n' +
        '    });\n' +
        '    return html;\n' +
        '}\n' +
        'function applyAllianceFilter() {\n' +
        '    var select = document.getElementById("exportAllianceFilter");\n' +
        '    if (!select) return;\n' +
        '    var alliance = select.value;\n' +
        '    document.querySelectorAll("table tbody tr").forEach(function(tr) {\n' +
        '        var cells = tr.querySelectorAll("td");\n' +
        '        if (cells.length < 2) {\n' +
        '            tr.style.display = alliance === "All" ? "" : "none";\n' +
        '            return;\n' +
        '        }\n' +
        '        var match = cells[1].textContent.trim().match(/^\\[([^\\]]+)\\]/);\n' +
        '        var rowAlliance = match ? match[1] : "";\n' +
        '        tr.style.display = (alliance === "All" || rowAlliance === alliance) ? "" : "none";\n' +
        '    });\n' +
        '    document.querySelectorAll(\'ol[id$="WaitingList"] li\').forEach(function(item) {\n' +
        '        var match = item.textContent.trim().match(/^\\[([^\\]]+)\\]/);\n' +
        '        var itemAlliance = match ? match[1] : "";\n' +
        '        item.style.display = (alliance === "All" || itemAlliance === alliance) ? "" : "none";\n' +
        '    });\n' +
        '    Object.keys(EXPORT_MESSAGE_DATA).forEach(function(modalId) {\n' +
        '        var modal = document.getElementById(modalId);\n' +
        '        if (!modal) return;\n' +
        '        var body = modal.querySelector(".modal-body");\n' +
        '        if (!body) return;\n' +
        '        var lines = EXPORT_MESSAGE_DATA[modalId];\n' +
        '        if (alliance !== "All") {\n' +
        '            var prefix = "[" + alliance + "]";\n' +
        '            lines = lines.filter(function(line) { return line.indexOf(prefix) !== -1; });\n' +
        '        }\n' +
        '        body.innerHTML = renderMessageBlocksHTML(lines);\n' +
        '    });\n' +
        '}\n' +
        'function copyExportMessage(btn) {\n' +
        '    var block = btn.closest(".message-block");\n' +
        '    var text = block.getAttribute("data-text");\n' +
        '    navigator.clipboard.writeText(text).catch(function(e) { console.log("Copy failed: " + e); });\n' +
        '}\n' +
        'function toggleDay(contentId) {\n' +
        '    var content = document.getElementById(contentId);\n' +
        '    var button = document.getElementById("toggle" + contentId.charAt(0).toUpperCase() + contentId.slice(1).replace("Content", ""));\n' +
        '    if (content.style.display === "none") {\n' +
        '        content.style.display = "";\n' +
        '        button.textContent = "Collapse";\n' +
        '    } else {\n' +
        '        content.style.display = "none";\n' +
        '        button.textContent = "Expand";\n' +
        '    }\n' +
        '}\n' +
        '</script>\n';

    var html = '<!DOCTYPE html>\n' +
        '<html lang="en" data-bs-theme="dark">\n' +
        '<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>KingShot Minister Scheduler - Appointments</title>\n' +
        '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">\n' +
        inlineStyles +
        '</head>\n' +
        '<body>\n' +
        '<h1>KingShot Minister Scheduler - Appointments</h1>\n' +
        navHTML +
        clone.outerHTML +
        exportJS +
        '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>\n' +
        '</body>\n' +
        '</html>';

    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'kingshot_appointments.html';
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Exports all scheduler tables and waiting lists to an Excel 2003 XML file.
 */
function exportToExcel() {
    if (!schedulerData.creationTimeMS) {
        alert('No data to export. Please process a CSV file first.');
        return;
    }

    var worksheetsData = extractAllWorksheets();

    if (worksheetsData.length === 0) {
        alert('No data to export. Please process a CSV file first.');
        return;
    }

    var xmlString = generateExcelXML(worksheetsData);

    var blob = new Blob([xmlString], { type: 'application/xml' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'kingshot_appointments.xml';
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Generates the worksheet title based on day number and table type.
 * @param {number} day - The day number.
 * @param {string} tableType - Either 'minister' or 'noble'.
 * @returns {string} The worksheet title.
 */
function generateWorksheetTitle(day, tableType) {
    var dayRole = getDayRole(day);
    if (tableType === 'minister') {
        var typeLabel = '';
        switch (dayRole) {
            case 'construction':
                typeLabel = 'Construction';
                break;
            case 'research':
                typeLabel = 'Research';
                break;
            case 'training':
                typeLabel = 'Training';
                break;
            case 'spillover':
                typeLabel = 'Spillover';
                break;
        }
        return 'Day ' + day + ' Chief Minister (' + typeLabel + ')';
    } else {
        return 'Day ' + day + ' Noble Advisor (Training)';
    }
}

/**
 * Generates headers for minister tables based on day role.
 * @param {number} day - The day number.
 * @returns {Array<string>} Array of header strings.
 */
function generateMinisterHeaders(day) {
    var dayRole = getDayRole(day);
    var speedupsHeader = '';
    switch (dayRole) {
        case 'construction':
            speedupsHeader = 'Construction';
            break;
        case 'research':
            speedupsHeader = 'Research';
            break;
        case 'training':
            speedupsHeader = 'Training';
            break;
        case 'spillover':
            speedupsHeader = 'Construction / Research / Training';
            break;
    }
    return ['Appointment Time', '[Alliance]Player', speedupsHeader, 'TrueGold', 'Tempered TrueGold', 'TrueGold Dust'];
}

/**
 * Generates headers for noble tables.
 * @returns {Array<string>} Array of header strings.
 */
function generateNobleHeaders() {
    return ['Appointment Time', '[Alliance]Player', 'Training Speedups'];
}

/**
 * Extracts table data from all tables and waiting lists.
 * @returns {Array<{name: string, headers: Array<string>, rows: Array<Array<string>>}>}
 */
function extractAllWorksheets() {
    var tables = [
        { id: 'day1MinisterTable', type: 'minister', day: 1 },
        { id: 'day1NobleTable', type: 'noble', day: 1 },
        { id: 'day2MinisterTable', type: 'minister', day: 2 },
        { id: 'day2NobleTable', type: 'noble', day: 2 },
        { id: 'day4MinisterTable', type: 'minister', day: 4 },
        { id: 'day4NobleTable', type: 'noble', day: 4 },
        { id: 'day5MinisterTable', type: 'minister', day: 5 },
        { id: 'day5NobleTable', type: 'noble', day: 5 }
    ];

    var worksheets = [];

    tables.forEach(function(table) {
        if (table.id === 'day4MinisterTable' && !schedulerData.generateDay4Ministers) {
            return;
        }
        var data = extractTableWorksheet(table.id, table.day, table.type);

        if (data && data.rows.length > 0) {
            worksheets.push(data);
        }
    });

    var waitingLists = [
        { id: 'day1WaitingList', day: 1 },
        { id: 'day2WaitingList', day: 2 },
        { id: 'day4WaitingList', day: 4 },
        { id: 'day5WaitingList', day: 5 }
    ];

    waitingLists.forEach(function(list) {
        var data = extractWaitingListWorksheet(list.id, list.day);

        if (data && data.rows.length > 0) {
            worksheets.push(data);
        }
    });

    return worksheets;
}

/**
 * Extracts table data for a single worksheet.
 * @param {string} tableId - The table element ID.
 * @param {number} day - The day number.
 * @param {string} tableType - Either 'minister' or 'noble'.
 * @returns {{name: string, headers: Array<string>, rows: Array<Array<string>>}|null}
 */
function extractTableWorksheet(tableId, day, tableType) {
    var table = document.getElementById(tableId);
    if (!table) return null;

    var tbody = table.querySelector('tbody');
    if (!tbody) return null;

    var headers = tableType === 'minister' ? generateMinisterHeaders(day) : generateNobleHeaders();
    var worksheetName = generateWorksheetTitle(day, tableType);
    var rows = [];

    tbody.querySelectorAll('tr').forEach(function(tr) {
        var cellElements = tr.querySelectorAll('td');
        
        // Skip the last cell (Actions column)
        var cells = [];
        for (var i = 0; i < cellElements.length - 1; i++) {
            var firstChild = cellElements[i].firstChild;
            cells.push(firstChild ? firstChild.textContent.trim() : cellElements[i].textContent.trim());
        }

        if (cells.length > 0 && cells[0] !== 'No appointments.') {
            rows.push(cells);
        }
    });

    return { name: worksheetName, headers: headers, rows: rows };
}

/**
 * Extracts waiting list data for a single worksheet.
 * @param {string} listId - The list element ID.
 * @param {number} day - The day number.
 * @returns {{name: string, headers: Array<string>, rows: Array<Array<string>>}|null}
 */
function extractWaitingListWorksheet(listId, day) {
    var list = document.getElementById(listId);
    if (!list) return null;

    var headers = ['[Alliance]Player', 'Training Speedups', 'Construction', 'Tempered TrueGold', 'Research', 'TrueGold Dust', 'TrueGold', 'Time Slots'];
    var worksheetName = 'Day ' + day + ' Waiting List';
    var rows = [];

    list.querySelectorAll('li').forEach(function(li) {
        var text = li.firstChild ? li.firstChild.textContent.trim() : li.textContent.trim();

        var parts = text.split(' - ');
        var alliancePlayer = parts[0] || '';

        var speedupsPart = parts[1] || '';
        var training = speedupsPart.match(/(?:^|\s)T:(\d+)/);
        var construction = speedupsPart.match(/(?:^|\s)C:(\d+)/);
        var tempered = speedupsPart.match(/(?:^|\s)TT:(\d+)/);
        var research = speedupsPart.match(/(?:^|\s)R:(\d+)/);
        var dust = speedupsPart.match(/(?:^|\s)TD:(\d+)/);
        var truegold = speedupsPart.match(/(?:^|\s)TG:(\d+)/);

        training = training ? training[1] : '0';
        construction = construction ? construction[1] : '0';
        tempered = tempered ? tempered[1] : '0';
        research = research ? research[1] : '0';
        dust = dust ? dust[1] : '0';
        truegold = truegold ? truegold[1] : '0';

        var timeSlots = '';
        if (parts[2]) {
            timeSlots = parts[2].replace('Time Slots: ', '').trim();
        }

        rows.push([alliancePlayer, training, construction, tempered, research, dust, truegold, timeSlots]);
    });

    return { name: worksheetName, headers: headers, rows: rows };
}

/**
 * Generates Excel 2003 XML string from worksheet data.
 * @param {Array<{name: string, headers: Array<string>, rows: Array<Array<string>>}>} worksheets
 * @returns {string} Excel 2003 XML string.
 */
function generateExcelXML(worksheets) {
    var timestamp = new Date().toISOString();

    var xml = '<?xml version="1.0"?>\n' +
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" \n' +
        '          xmlns:o="urn:schemas-microsoft-com:office:office" \n' +
        '          xmlns:x="urn:schemas-microsoft-com:office:excel" \n' +
        '          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n' +
        '          xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
        '    <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">\n' +
        '        <Author>KingShot Scheduler</Author>\n' +
        '        <Created>' + timestamp + '</Created>\n' +
        '    </DocumentProperties>\n' +
        '    <Styles>\n' +
        '        <Style ss:ID="Default" ss:Name="Normal">\n' +
        '            <Font ss:FontName="Calibri" ss:Size="11"/>\n' +
        '        </Style>\n' +
        '        <Style ss:ID="Header">\n' +
        '            <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>\n' +
        '            <Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>\n' +
        '        </Style>\n' +
        '    </Styles>\n';

    worksheets.forEach(function(worksheet) {
        xml += '\n    <Worksheet ss:Name="' + worksheet.name + '">\n        <Table>';

        xml += '\n            <Row>';
        worksheet.headers.forEach(function(header) {
            xml += '\n                <Cell ss:StyleID="Header"><Data ss:Type="String">' + escapeXml(header) + '</Data></Cell>';
        });
        xml += '\n            </Row>';

        worksheet.rows.forEach(function(row) {
            xml += '\n            <Row>';
            row.forEach(function(cell) {
                var type = isNumeric(cell) ? 'Number' : 'String';
                xml += '\n                <Cell><Data ss:Type="' + type + '">' + escapeXml(cell) + '</Data></Cell>';
            });
            xml += '\n            </Row>';
        });

        xml += '\n        </Table>\n    </Worksheet>';
    });

    xml += '\n</Workbook>';

    return xml;
}

/**
 * Escapes XML special characters.
 * @param {string} text - The text to escape.
 * @returns {string} Escaped text.
 */
function escapeXml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Checks if a string represents a numeric value.
 * @param {string} value - The value to check.
 * @returns {boolean} True if numeric.
 */
function isNumeric(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
}
