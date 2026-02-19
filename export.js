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
 * Determines the role type for a given day.
 * @param {number} day - The day number (1, 2, 4, or 5).
 * @returns {string} The day role type: 'construction', 'research', 'training', or 'spillover'.
 */
function getDayRole(day) {
    if (day === 4) {
        return 'training';
    }
    if (day === schedulerData.constructionKingDay) {
        return 'construction';
    }
    if (day === schedulerData.researchKingDay) {
        return 'research';
    }
    return 'spillover';
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
    return ['Appointment Time', 'Alliance/Player', speedupsHeader, 'TrueGold'];
}

/**
 * Generates headers for noble tables.
 * @returns {Array<string>} Array of header strings.
 */
function generateNobleHeaders() {
    return ['Appointment Time', 'Alliance/Player', 'Training Speedups'];
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

    var headers = ['Alliance/Player', 'Training Speedups', 'Construction', 'Research', 'TrueGold', 'Time Slots'];
    var worksheetName = 'Day ' + day + ' Waiting List';
    var rows = [];

    list.querySelectorAll('li').forEach(function(li) {
        var text = li.firstChild ? li.firstChild.textContent.trim() : li.textContent.trim();

        var parts = text.split(' - ');
        var alliancePlayer = parts[0] || '';

        var speedupsPart = parts[1] || '';
        var training = speedupsPart.match(/T:(\d+)/);
        var construction = speedupsPart.match(/C:(\d+)/);
        var research = speedupsPart.match(/R:(\d+)/);
        var truegold = speedupsPart.match(/TG:(\d+)/);

        training = training ? training[1] : '0';
        construction = construction ? construction[1] : '0';
        research = research ? research[1] : '0';
        truegold = truegold ? truegold[1] : '0';

        var timeSlots = '';
        if (parts[2]) {
            timeSlots = parts[2].replace('Time Slots: ', '').trim();
        }

        rows.push([alliancePlayer, training, construction, research, truegold, timeSlots]);
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
