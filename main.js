/**
 * NW2TMX.
 *
 * @since 12/04/2017
 * @author Jave Cross
 */
/* global __dirname */
const
    ELECTRON = require('electron'),
    PATH = require('path'),
    URL = require('url'),
    FILE_SYSTEM = require('fs'),
    SETTINGS = require('electron-settings'),
    LOGGER = require('electron-log'),
    CONSTANTS = require('./resources/js/constants'),
    BOARD_CONVERTER = require('./resources/js/board-converter'),
    MENU = ELECTRON.Menu,
    IPC = ELECTRON.ipcMain,
    DIALOG = ELECTRON.dialog,
    APP = ELECTRON.app,
    BROWSER_WINDOW = ELECTRON.BrowserWindow,
    INDEX_PAGE_PATH = '/view/index.html';
LOGGER.transports.file.level = 'warn';
LOGGER.transports.file.maxSize = 5 * 1024 * 1024;
LOGGER.transports.file.file = __dirname + '/log.txt';
LOGGER.transports.file.streamConfig = {'flags': 'w'};
LOGGER.transports.file.stream = FILE_SYSTEM.createWriteStream('log.txt');

LOGGER.debug('[MAIN] Logger initialized using path: ' + LOGGER.transports.file.file);

let mainWindow,
    menuTemplate = [
        {
            label: 'Window',
            role: 'window',
            submenu: [
                {
                    label: 'Close',
                    accelerator: 'ALT+F4',
                    role: 'close'
                }
            ]
        },
        {
            label: 'View',
            role: 'view',
            submenu: [
                {
                    label: 'Developer Tools',
                    accelerator: 'Ctrl+Shift+I',
                    click: function (item, focusedWindow) {
                        if (focusedWindow) {
                            focusedWindow.toggleDevTools();
                        }
                    }
                }
            ]
        },
        {
            label: 'Help',
            role: 'help',
            submenu: [
                {
                    label: 'Open-source licenses',
                    click: function () {
                        mainWindow.webContents.send('open-source-view');
                    }
                },
                {
                    label: 'About',
                    click: function () {
                        mainWindow.webContents.send('about-nw-to-tmx');
                    }
                }
            ]
        }
    ];
function initializeMainWindow() {
    const menu = MENU.buildFromTemplate(menuTemplate);
    MENU.setApplicationMenu(menu);

    LOGGER.info('[MAIN] Initializing window.');

    // Load 'preferences'
    let lastTileset = SETTINGS.get('prefs.tileset'),
        lastDestination = SETTINGS.get('prefs.destination');

    if (lastTileset && lastTileset.length) {
        LOGGER.debug('[MAIN] Found default tileset path: ' + lastTileset);
        try {
            FILE_SYSTEM.accessSync(
                lastTileset,
                FILE_SYSTEM.constants.R_OK | FILE_SYSTEM.constants.W_OK
                );
            global.lastTileset = lastTileset;
        } catch (err) {
            LOGGER.warn('[MAIN] Unable to access default tileset: ' + err.message);
        }
    } else {
        LOGGER.debug('[MAIN] No default tileset path found.');
    }

    if (lastDestination && lastDestination.length) {
        LOGGER.debug('[MAIN] Found default destination path: ' + lastDestination);
        try {
            let dirStat = FILE_SYSTEM.lstatSync(lastDestination);
            if (dirStat && dirStat.isDirectory()) {
                LOGGER.debug('[MAIN] Verified destination directory.');
                global.lastDestination = lastDestination;
            } else {
                LOGGER.warn('[MAIN] Invalid destination directory.');
            }
        } catch (err) {
            LOGGER.warn('[MAIN] Unable to access last destination directory.');
        }
    } else {
        LOGGER.debug('[MAIN] No default destination path found.');
    }

    mainWindow = new BROWSER_WINDOW({
        'width': 400,
        'minWidth': 400,
        'height': 600,
        'minHeight': 600,
        'autoHideMenuBar': true
    });

    mainWindow.loadURL(URL.format({
        'pathname': PATH.join(__dirname, INDEX_PAGE_PATH),
        'protocol': 'file:',
        'slashes': true
    }));

    mainWindow.on('closed', () => {
        // Allow GC.
        mainWindow = null;
    });
}

function sequentialFileConversion(fileArray, tileset, destination, results, callback) {
    if (!results) {
        results = {};
    }
    if (!results.success) {
        results.success = 0;
    }
    if (!results.error) {
        results.error = 0;
    }

    if (!fileArray || !fileArray.length) {
        callback(results);
        return;
    }

    let currentFile = fileArray.shift(),
        fileBaseName,
        fileExtension;

    if (!currentFile) {
        callback(results);
        return;
    }
    fileExtension = PATH.extname(currentFile).substring(1);
    fileBaseName = PATH.basename(currentFile, PATH.extname(currentFile));
    switch (fileExtension) {
        case 'gmap':
        {
            LOGGER.info('[MAIN] Processing GMAP file: ' + fileBaseName);
            BOARD_CONVERTER.convertMapFileToJson(currentFile, (err, jsonMap) => {
                if (err) {
                    LOGGER.warn('[MAIN] Unable to convert map: ' + err.message);
                    results.error++;
                    sequentialFileConversion(fileArray, tileset, destination, results, callback);
                    return;
                }

                LOGGER.info('[MAIN] Converted gmap file to JSON: ' + currentFile);

                let convertedMapName = fileBaseName + '.' + CONSTANTS.TMX_FILE_EXTENSION,
                    finalFileName = destination + '/' + convertedMapName,
                    tmxData = BOARD_CONVERTER.convertJsonLevelToTmx(jsonMap, tileset);

                LOGGER.debug(
                    '[MAIN] Preparing to save TMX data to destination: ' +
                    finalFileName
                    );
                FILE_SYSTEM.writeFile(finalFileName, tmxData, (err) => {
                    if (err) {
                        LOGGER.warn('[MAIN] Unable to save file: ' + err.message);
                        results.error++;
                        sequentialFileConversion(
                            fileArray,
                            tileset,
                            destination,
                            results,
                            callback
                            );
                        return;
                    }
                    LOGGER.info('[MAIN] Saved map file: ' + finalFileName);
                    results.success++;
                    sequentialFileConversion(fileArray, tileset, destination, results, callback);
                });
            });
            break;
        }
        case 'nw':
        {
            LOGGER.info('[MAIN] Processing NW file: ' + fileBaseName);
            BOARD_CONVERTER.convertNwFileToJson(currentFile, (err, jsonLevel) => {
                if (err) {
                    LOGGER.warn('[MAIN] Unable to convert level: ' + err.message);
                    results.error++;
                    sequentialFileConversion(fileArray, tileset, destination, results, callback);
                    return;
                }
                let tmxData = BOARD_CONVERTER.convertJsonLevelToTmx(jsonLevel, tileset),
                    convertedName = PATH.basename(currentFile, PATH.extname(currentFile))
                    + '.'
                    + CONSTANTS.TMX_FILE_EXTENSION;

                LOGGER.debug('[MAIN] Saving "' + destination + '/' + convertedName + '"');

                FILE_SYSTEM.writeFile(destination + '/' + convertedName, tmxData, (err) => {
                    if (err) {
                        LOGGER.warn('[MAIN] Unable to write converted file: ' + err.message);
                        results.error++;
                        sequentialFileConversion(
                            fileArray,
                            tileset,
                            destination,
                            results,
                            callback
                            );
                        return;
                    }
                    LOGGER.debug('[MAIN] Processed and saved.');
                    results.success++;
                    sequentialFileConversion(fileArray, tileset, destination, results, callback);
                });
            });
            break;
        }
        default:
        {
            LOGGER.info('[MAIN] Unable to process file: ' + currentFile + ' unknown extension.');
            results.error++;
            sequentialFileConversion(fileArray, tileset, destination, results, callback);
        }
    }
}

// ------------------- EVENTS -------------------------

IPC.on(CONSTANTS.ERROR_NO_VALID_SOURCE_FILES, () => {
    DIALOG.showErrorBox(
        'Invalid source files selected!',
        'No valid source files selected (requires nw files).'
        );
});

IPC.on(CONSTANTS.ERROR_MULTIPLE_TILESET_SELECTED, () => {
    DIALOG.showErrorBox(
        'Multiple tileset files selected!',
        'Only a single tileset file can be selected.'
        );
});

IPC.on(CONSTANTS.ERROR_INVALID_TILESET_FORMAT, () => {
    DIALOG.showErrorBox(
        'Invalid tileset format!',
        'Please select a valid image tileset format.'
        );
});

IPC.on(CONSTANTS.CONVERT_FILES_COMMAND, (event, arg) => {
    // VALIDATION
    if (!arg) {
        // ERR.
        DIALOG.showErrorBox(
            'Unable to perform conversion!',
            'Conversion arguments corrupt or missing.'
            );
        event.sender.send(CONSTANTS.COMPLETED_CONVERSION_COMMAND);
        return;
    }
    if (!arg.destinationFolderPath || !arg.destinationFolderPath) {
        // ERR.
        DIALOG.showErrorBox(
            'Unable to perform conversion!',
            'Destination/output folder not provided.'
            );
        event.sender.send(CONSTANTS.COMPLETED_CONVERSION_COMMAND);
        return;
    }
    if (!arg.sourceTilesetFile || !arg.sourceTilesetFile.length) {
        // ERR.
        DIALOG.showErrorBox(
            'Unable to perform conversion!',
            'Source tileset image/file not provided.'
            );
        event.sender.send(CONSTANTS.COMPLETED_CONVERSION_COMMAND);
        return;
    }
    if (!arg.sourceFileArray || !arg.sourceFileArray.length) {
        // ERR.
        DIALOG.showErrorBox(
            'Unable to perform conversion!',
            'Source level files not provided.'
            );
        event.sender.send(CONSTANTS.COMPLETED_CONVERSION_COMMAND);
        return;
    }
    SETTINGS.set('prefs', {
        'tileset': arg.sourceTilesetFile,
        'destination': arg.destinationFolderPath
    });

    sequentialFileConversion(
        arg.sourceFileArray,
        arg.sourceTilesetFile,
        arg.destinationFolderPath,
        {},
        function (results) {
            event.sender.send(CONSTANTS.COMPLETED_CONVERSION_COMMAND, results);
        }
    );
});

// App Triggers.
APP.on('ready', initializeMainWindow);

APP.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        APP.quit();
    }
});

APP.on('activate', () => {
    if (mainWindow === null) {
        initializeMainWindow();
    }
});