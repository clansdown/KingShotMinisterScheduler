/**
 * storage.js - Handles persistence of scheduler data using the Origin Private File System (OPFS).
 */

const FILE_PREFIX = 'scheduler_data_';
const FILE_EXTENSION = '.json';

/**
 * Saves the scheduler data to the Origin Private File System.
 * The filename is derived from the creationTimeMS property.
 * @param {SchedulerData} data - The data to save.
 * @returns {Promise<void>}
 */
async function saveSchedulerData(data) {
    if (!data.creationTimeMS) {
        console.error('Cannot save data: creationTimeMS is missing');
        return;
    }

    if (!navigator.storage || !navigator.storage.getDirectory) {
        console.warn('OPFS not supported in this browser/environment. Data will not be saved persistently.');
        return;
    }

    try {
        const root = await navigator.storage.getDirectory();
        const filename = `${FILE_PREFIX}${data.creationTimeMS}${FILE_EXTENSION}`;
        const fileHandle = await root.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data));
        await writable.close();
        console.log(`Saved scheduler data to ${filename}`);
    } catch (error) {
        if (error.name === 'SecurityError') {
            console.warn('OPFS access blocked (SecurityError). Data will not be saved persistently.');
        } else {
            console.error('Error saving scheduler data:', error);
            throw error;
        }
    }
}

/**
 * Lists all scheduler data files in the OPFS.
 * @returns {Promise<Array<{name: string, timestamp: number}>>} List of files sorted by timestamp descending (newest first).
 */
async function listSchedulerDataFiles() {
    if (!navigator.storage || !navigator.storage.getDirectory) {
        return [];
    }

    try {
        const root = await navigator.storage.getDirectory();
        const files = [];
        
        // Iterate over all entries in the directory
        // @ts-ignore - for...await of is valid for FileSystemDirectoryHandle
        for await (const entry of root.values()) {
            if (entry.kind === 'file' && entry.name.startsWith(FILE_PREFIX) && entry.name.endsWith(FILE_EXTENSION)) {
                // Extract timestamp from filename: scheduler_data_1234567890.json
                const timestampStr = entry.name.slice(FILE_PREFIX.length, -FILE_EXTENSION.length);
                const timestamp = parseInt(timestampStr, 10);
                if (!isNaN(timestamp)) {
                    files.push({
                        name: entry.name,
                        timestamp: timestamp
                    });
                }
            }
        }

        // Sort by timestamp descending
        return files.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        if (error.name === 'SecurityError') {
            console.warn('OPFS access blocked (SecurityError). Cannot list scheduler files.');
        } else {
            console.error('Error listing scheduler data files:', error);
        }
        return [];
    }
}

/**
 * Retrieves a specific scheduler data file by name.
 * @param {string} filename - The name of the file to retrieve.
 * @returns {Promise<SchedulerData|null>} The loaded data or null if not found.
 */
async function getSchedulerDataByName(filename) {
    if (!navigator.storage || !navigator.storage.getDirectory) {
        return null;
    }

    try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (error) {
        if (error.name === 'SecurityError') {
            console.warn(`OPFS access blocked (SecurityError). Cannot load file ${filename}.`);
        } else {
            console.error(`Error loading file ${filename}:`, error);
        }
        return null;
    }
}

/**
 * Retrieves the most recent scheduler data file.
 * @returns {Promise<SchedulerData|null>} The most recent data or null if no files exist.
 */
async function getMostRecentSchedulerData() {
    const files = await listSchedulerDataFiles();
    if (files.length === 0) {
        return null;
    }
    return getSchedulerDataByName(files[0].name);
}
