/**
 * index-renderer.js
 *
 *
 */
/* global ca, document, console, CONSTANTS */

const DIALOG = require('electron').remote.dialog,
    IPC = require('electron').ipcRenderer,
    REMOTE = require('electron').remote,
    SHELL = require('electron').shell,
    ca = {};
ca.jave = {};
ca.jave.cross = {};
ca.jave.cross.IndexPageView = (function () {
    'use strict';

    var sourceFileArray = [],
        sourceTilesetFile,
        destinationFolderPath;

    function updateConvertButtonStatus() {
        let convertButton = document.querySelector('#convert-button-container button');
        if (!sourceFileArray || !sourceFileArray.length) {
            convertButton.disabled = true;
            return;
        }
        if (!sourceTilesetFile || !sourceTilesetFile.length) {
            convertButton.disabled = true;
            return;
        }
        if (!destinationFolderPath || !destinationFolderPath.length) {
            convertButton.disabled = true;
            return;
        }

        convertButton.disabled = false;
    }

    function userSelectedSourceFile(filePathObject) {
        if (!filePathObject || !filePathObject.length) {
            IPC.send(CONSTANTS.ERROR_NO_SOURCE_SELECTED);
            return;
        }
        let totalFiles = filePathObject.length,
            validFiles = [],
            invalidFiles = [];
        for (let filePath of filePathObject) {
            if (CONSTANTS.LEVEL_FILE_REGEX.test(filePath)) {
                validFiles.push(filePath);
            } else {
                invalidFiles.push(filePath);
            }
        }

        if (!validFiles.length) {
            IPC.send(CONSTANTS.ERROR_NO_VALID_SOURCE_FILES);
            document
                .querySelector('#source-file-input .file-input .sub-text')
                .innerText = 'Drag and drop files';
            document
                .querySelector('#source-file-input .file-input .icon span')
                .className = 'fa fa-cloud-upload';
            sourceFileArray = [];
            updateConvertButtonStatus();
            return;
        }

        let cloudClass = 'all-valid',
            iconSelector = '#source-file-input .file-input .icon span';
        if (invalidFiles.length > 0) {
            IPC.send(CONSTANTS.WARN_SOME_INVALID_SOURCE_FILES);
            cloudClass = 'some-valid';
        }

        document
            .querySelector('#source-file-input .file-input .sub-text')
            .innerText = 'Loaded '
            + validFiles.length
            + ' of '
            + totalFiles
            + ' files';
        document
            .querySelector(iconSelector)
            .className = 'fa fa-cloud ' + cloudClass;

        sourceFileArray = validFiles;
        updateConvertButtonStatus();
    }

    function userSelectedTilesetFile(filePathObject) {
        if (!filePathObject || !filePathObject.length) {
            IPC.send(CONSTANTS.ERROR_NO_TILESET_SELECTED);
            return;
        }
        if (filePathObject.length > 1) {
            IPC.send(CONSTANTS.ERROR_MULTIPLE_TILESET_SELECTED);
            return;
        }
        let tilesetPath = filePathObject[0];
        if (!CONSTANTS.TILESET_FILE_REGEX.test(tilesetPath)) {
            IPC.send(CONSTANTS.ERROR_INVALID_TILESET_FORMAT);
            return;
        }
        document
            .querySelector('#source-tileset-input .file-input .icon span')
            .className = 'fa fa-cloud all-valid';
        document
            .querySelector('#source-tileset-input .file-input .sub-text')
            .innerText = tilesetPath;
        sourceTilesetFile = tilesetPath;
        updateConvertButtonStatus();
    }

    function userSelectedDestination(filePathObject) {
        if (!filePathObject || !filePathObject.length) {
            // ERR.
            return;
        }
        if (filePathObject.length > 1) {
            // ERR.
            return;
        }
        let destinationFolder = filePathObject[0];

        document
            .querySelector('#destination-folder-input button .text')
            .innerText = 'Destination Selected';
        document
            .querySelector('#destination-folder-input button .sub-text')
            .innerText = destinationFolder;
        document
            .querySelector('#destination-folder-input button .icon')
            .className = 'icon fa fa-folder';
        destinationFolderPath = destinationFolder;
        updateConvertButtonStatus();
    }

    return {

        openMenuSlider: function () {
            document.getElementById('menu-slider').style.width = '100%';
            document.getElementById('menu-slider').style.display = 'block';
        },
        closeMenuSlider: function () {
            document.getElementById('menu-slider').style.display = 'none';
        },
        showDestinationDialog: function () {
            DIALOG.showOpenDialog(
                {'properties': ['openDirectory']},
                userSelectedDestination
                );
        },
        convertNwFiles: function () {
            let conversionParams = {
                'sourceTilesetFile': sourceTilesetFile,
                'destinationFolderPath': destinationFolderPath,
                'sourceFileArray': sourceFileArray
            };
            document
                .querySelector('#source-file-input .file-input .sub-text')
                .innerText = 'Drag and drop files';
            document
                .querySelector('#source-file-input .file-input .icon span')
                .className = 'fa fa-cloud-upload';

            console.log(
                '[CONVERT] Starting conversion using params:',
                conversionParams
                );
            sourceFileArray = [];
            updateConvertButtonStatus();

            document.getElementById('app-modal').className = 'w3-modal visible';
            IPC.send(CONSTANTS.CONVERT_NW_FILES_COMMAND, conversionParams);
        },
        initializeView: function () {
            let sourceFileInput = document.getElementById('source-file-input'),
                sourceTilesetInput = document.getElementById('source-tileset-input'),
                lastTileset = REMOTE.getGlobal('lastTileset'),
                lastDestination = REMOTE.getGlobal('lastDestination');

            if (lastTileset && lastTileset.length) {
                userSelectedTilesetFile([lastTileset]);
            }
            if (lastDestination && lastDestination.length) {
                userSelectedDestination([lastDestination]);
            }

            sourceFileInput.ondragover =
                sourceFileInput.ondragend =
                sourceFileInput.ondragleave =
                sourceTilesetInput.ondragover =
                sourceTilesetInput.ondragend =
                sourceTilesetInput.ondragleave =
                document.ondragover =
                document.ondragend =
                document.ondrop = (e) => {
                e.preventDefault();
                return false;
            };
            sourceFileInput.ondrop = (e) => {
                e.preventDefault();
                let filePathList = [];
                for (let file of e.dataTransfer.files) {
                    filePathList.push(file.path);
                }
                userSelectedSourceFile(filePathList);
                return false;
            };
            sourceTilesetInput.ondrop = (e) => {
                e.preventDefault();
                let filePathList = [];
                for (let file of e.dataTransfer.files) {
                    filePathList.push(file.path);
                }
                userSelectedTilesetFile(filePathList);
                return false;
            };
            sourceFileInput.onclick = () => {
                DIALOG.showOpenDialog(
                    {
                        'properties': ['openFile', 'multiSelections'],
                        'filters': [
                            {'name': 'Levels', 'extensions': ['nw']}
                        ]
                    },
                    userSelectedSourceFile
                    );
            };
            sourceTilesetInput.onclick = () => {
                DIALOG.showOpenDialog(
                    {
                        'properties': ['openFile'],
                        'filters': [
                            {'name': 'Images', 'extensions': ['png', 'gif']}
                        ]
                    },
                    userSelectedTilesetFile
                    );
            };

            IPC.on(CONSTANTS.COMPLETED_CONVERSION_COMMAND, () => {
                document.getElementById('app-modal').className = 'w3-modal';
            });

            IPC.on(CONSTANTS.SHOW_ABOUT_APP_MODAL, () => {
                document.getElementById('about-app-modal').style.display = 'block';
            });
            IPC.on(CONSTANTS.SHOW_OPEN_SOURCE_MODAL, () => {
                document.getElementById('open-source-modal').style.display = 'block';
            });

            document
                .querySelector('#about-app-modal .version-number')
                .innerText = CONSTANTS.VERSION_NUMBER;

            document
                .querySelector('a.github-external-link')
                .onclick = () => {
                SHELL.openExternal(CONSTANTS.GITHUB_SOURCE_LINK);
            };

            document.getElementById('font-awesome-source').onclick = () => {
                SHELL.openExternal('http://fontawesome.io/license/');
            };
            document.getElementById('w3-css-source').onclick = () => {
                SHELL.openExternal('https://www.w3schools.com/w3css/w3css_downloads.asp');
            };
            document.getElementById('mustache-source').onclick = () => {
                SHELL.openExternal('https://github.com/janl/mustache.js/blob/master/LICENSE');
            };
            document.getElementById('electron-settings-source').onclick = () => {
                SHELL.openExternal(
                    'https://github.com/nathanbuchar/electron-settings/blob/master/LICENSE.md'
                    );
            };
            document.getElementById('electron-log-source').onclick = () => {
                SHELL.openExternal('https://github.com/megahertz/electron-log/blob/master/LICENSE');
            };
            document.getElementById('electron-source').onclick = () => {
                SHELL.openExternal('https://github.com/electron/electron/blob/master/LICENSE');
            };
        }
    };
})();
ca.jave.cross.IndexPageView.initializeView();

