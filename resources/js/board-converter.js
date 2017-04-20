/**
 * Board Converter.
 *
 * @since 12/04/2017
 * @author JaveCross
 */
/* global __dirname */
const
    FILE_SYSTEM = require('fs'),
    PATH = require('path'),
    MUSTACHE = require('mustache'),
    LOGGER = require('electron-log'),
    BOARD_CONSTANTS = require('./board-constants'),
    TMX_FILE_TEMPLATE_PATH = '/../templates/tiled-map-format.xml',
    TMX_FILE_TEMPLATE = FILE_SYSTEM.readFileSync(__dirname + TMX_FILE_TEMPLATE_PATH, 'UTF-8');
function getTileLocation(tileId) {
    if (!tileId || tileId.length !== 2) {
        throw new Error('Invalid tile ID length');
    }

    var firstChar = tileId[0],
        secondChar = tileId[1],
        firstCharIndex = BOARD_CONSTANTS.NW_TILE_ID_PATTERN.indexOf(firstChar),
        secondCharIndex = BOARD_CONSTANTS.NW_TILE_ID_PATTERN.indexOf(secondChar),
        hChunkOffset = Math.floor(firstCharIndex / 8),
        hChunkOffsetReal = hChunkOffset * 16,
        hTileSelect = secondCharIndex % 16,
        vChunkOffset = firstCharIndex % 8,
        vChunkOffsetReal = vChunkOffset * 4,
        vTileSelect = Math.floor(secondCharIndex / 16);

    return {
        'tile': tileId,
        'x': (hChunkOffsetReal + hTileSelect),
        'y': (vChunkOffsetReal + vTileSelect)
    };
}

function convertTileLocationToIndex(tileLocation) {
    if (!tileLocation) {
        throw new Error('Tile location is required!');
    }
    if (tileLocation.x === undefined || tileLocation.y === undefined) {
        throw new Error('Tile locaiton x/y is required!');
    }
    if (tileLocation.x < 0 || tileLocation.y < 0) {
        throw new Error('Tile x/y is invalid (less than zero).');
    }

    return 1 + (tileLocation.y * 128) + tileLocation.x;
}

function verifyNwLevelFile(levelData, callback) {
    if (!BOARD_CONSTANTS.NW_LEVEL_HEADER.test(levelData)) {
        callback({
            'valid': false,
            'message': 'Invalid level header, requires "GLEVNW01" in the header.'
        });
        return;
    }
    if (!BOARD_CONSTANTS.NW_FIRST_BOARD_REGEX.test(levelData)) {
        callback({
            'valid': false,
            'message': 'Invalid or corrupt level board. Unable to locate row 0 0 64 0.'
        });
        return;
    }
    if (!BOARD_CONSTANTS.NW_LAST_BOARD_REGEX.test(levelData)) {
        callback({
            'valid': false,
            'message': 'Invalid or corrupt level board. Unable to locate row 0 63 64 0.'
        });
        return;
    }
    callback({
        'valid': true
    });
}

function verifyGmapLevelFile(mapData, callback) {
    if (!BOARD_CONSTANTS.GMAP_FILE_HEADER_REGEX.test(mapData)) {
        callback({
            'valid': false,
            'message': 'Invalid map header, requires "GRMAP001" in the header.'
        });
        return;
    }
    if (!BOARD_CONSTANTS.GMAP_WIDTH_REGEX.test(mapData)) {
        callback({
            'valid': false,
            'message': 'Invalid or corrupt map data. Unable to locate WIDTH.'
        });
        return;
    }
    if (!BOARD_CONSTANTS.GMAP_HEIGHT_REGEX.test(mapData)) {
        callback({
            'valid': false,
            'message': 'Invalid or corrupt map. Unable to locate HEIGHT.'
        });
        return;
    }
    callback({
        'valid': true
    });
}

function sequentialMapConverter(mapLevelList, mapRows, levelConverterFunction, callback) {
    if (!mapRows) {
        callback(new Error('Initialized mapRows is required!'));
        return;
    }
    if (!levelConverterFunction) {
        callback(new Error('Level converter function is required.'));
        return;
    }
    if (!mapLevelList || !mapLevelList.length) {
        callback(null, {'success': true, 'rows': mapRows});
        return;
    }

    let singleMapLevel = mapLevelList.shift();
    if (!singleMapLevel) {
        callback(null, {'success': true, 'rows': mapRows});
        return;
    }

    LOGGER.debug('[BOARDCONVERTER] Starting level conversion for: ' + singleMapLevel.levelPath);
    levelConverterFunction(
        singleMapLevel.levelPath,
        function (err, jsonLevel) {
            if (err) {
                LOGGER.warn(
                    '[BORDCONVERTER] Unable to process level "'
                    + singleMapLevel.levelPath
                    + '", ERR: '
                    + err.message
                    );
                callback(err);
                return;
            }
            LOGGER.debug(
                '[BOARDCONVERTER] Completed JSON conversion: '
                + PATH.basename(jsonLevel.filePath, PATH.extname(jsonLevel.filePath))
                );

            let singleRow,
                rowIndex = (singleMapLevel.y * 64);
            for (singleRow of jsonLevel.board.rows) {
                if (!mapRows[rowIndex]) {
                    mapRows[rowIndex] = [];
                }
                mapRows[rowIndex].push(singleRow);
                rowIndex++;
            }

            sequentialMapConverter(mapLevelList, mapRows, levelConverterFunction, callback);
        }
    );
}

function BoardConverter() {
    this.convertMapFileToJson = function (filePath, callback) {
        if (!filePath || !filePath.length) {
            callback(new Error('Filepath param is required!'));
            return;
        }
        let jsonData = {
            'filePath': filePath,
            'layerTitle': PATH.basename(filePath, PATH.extname(filePath)),
            'board': {
                'rows': []
            }
        };

        FILE_SYSTEM.readFile(filePath, 'UTF-8', (err, contents) => {
            if (err) {
                LOGGER.warn('[BOARDCONVERTER] Unable to read file: ' + err.message);
                callback(err);
                return;
            }

            verifyGmapLevelFile(contents, (verify) => {
                if (!verify.valid) {
                    verify['filename'] = filePath;
                    callback(verify, null);
                    return;
                }

                // GMAP file is verified, extract details.
                let gmapWidthResult = BOARD_CONSTANTS.GMAP_WIDTH_REGEX.exec(contents),
                    gmapHeightResult = BOARD_CONSTANTS.GMAP_HEIGHT_REGEX.exec(contents),
                    gmapFilePath = PATH.dirname(filePath),
                    gmapFileName = PATH.basename(filePath, PATH.extname(filePath)),
                    gmapLevels = [],
                    singleLevelName,
                    gmapWidth,
                    gmapHeight,
                    totalLevels = -1,
                    matchIndex = 0;

                if (!gmapWidthResult || !gmapWidthResult[1]) {
                    LOGGER.warn('[MAPCONVERTER] Invalid or corrupt map. Unable to extract width');
                    callback(new Error('Unable to extract width.'));
                    return;
                }
                gmapWidth = gmapWidthResult[1];

                if (!gmapHeightResult || !gmapHeightResult[1]) {
                    LOGGER.warn('[MAPCONVERTER] Invalid or corrupt map. Unable to extract height.');
                    callback(new Error('Unable to extract height.'));
                    return;
                }
                gmapHeight = gmapHeightResult[1];
                totalLevels = gmapWidth * gmapHeight;

                jsonData['widthInTiles'] = 64 * gmapWidth;
                jsonData['heightInTiles'] = 64 * gmapHeight;
                LOGGER.debug('[MAPCONVERTER] Starting to process levelnames.');
                while ((singleLevelName = BOARD_CONSTANTS.GMAP_LEVEL_NAME_REGEX.exec(contents))) {
                    if (!singleLevelName || !singleLevelName[1]) {
                        LOGGER.warn('[MAPCONVERTER] Invalid level name format.');
                        break;
                    }
                    let fullPath = gmapFilePath + '/' + singleLevelName[1];

                    try {
                        FILE_SYSTEM.accessSync(fullPath);
                        gmapLevels.push(
                            {
                                'levelPath': fullPath,
                                'levelName': singleLevelName[1],
                                'x': matchIndex % gmapWidth,
                                'y': Math.floor(matchIndex / gmapWidth),
                                'index': matchIndex
                            }
                        );
                        matchIndex++;
                    } catch (err) {
                        LOGGER.warn(
                            '[MAPCONVERTER] Unable to load level: '
                            + fullPath
                            + ': '
                            + err.message
                            );
                        break;
                    }
                }
                if (gmapLevels.length !== totalLevels) {
                    callback(new Error(
                        'Invalid or corrupt map file, found '
                        + gmapLevels.length
                        + ' levels, but expected: '
                        + totalLevels
                        ));
                    return;
                }

                sequentialMapConverter(
                    gmapLevels,
                    [],
                    this.convertNwFileToJson,
                    function (err, result) {
                        if (err) {
                            LOGGER.warn(
                                '[BORDCONVERTER] Unable to convert map to JSON: '
                                + err.message
                                );
                            callback(err);
                            return;
                        }
                        if (!result || !result.success) {
                            LOGGER.warn(
                                '[BOARDCONVERTER] Invalid results received from json parser...'
                                );
                            callback(new Error('Invalid results received from json parser.'));
                            return;
                        }

                        let fullRow,
                            fullBoard = [];

                        for (fullRow of result.rows) {
                            fullBoard.push(fullRow.join(','));
                        }

                        jsonData.board.rows = fullBoard;
                        callback(null, jsonData);
                    }
                );
            });
        });
    };

    this.convertNwFileToJson = function (filePath, callback) {
        if (!filePath || !filePath.length) {
            callback(new Error('Filepath param is required!'));
            return;
        }
        let jsonData = {
            'filePath': filePath,
            'widthInTiles': 64,
            'heightInTiles': 64,
            'layerTitle': PATH.basename(filePath, PATH.extname(filePath))
        };

        FILE_SYSTEM.readFile(filePath, 'UTF-8', (err, contents) => {
            if (err) {
                callback(err);
            }
            verifyNwLevelFile(contents, (verify) => {
                if (!verify.valid) {
                    verify['filename'] = filePath;
                    callback(verify, null);
                    return;
                }

                var singleRow,
                    singleTile,
                    rowIndex = 0,
                    boardJson = {
                        'rows': []
                    };
                try {
                    while ((singleRow = BOARD_CONSTANTS.NW_GENERAL_ROW_REGEX.exec(contents))) {
                        if (!singleRow || singleRow.length !== 2) {
                            throw new Error(
                                'Unable to parse row '
                                + rowIndex
                                + ' unable to find row data.'
                                );
                        }

                        let rowResult = singleRow[1],
                            rowString = '',
                            tileCount = 0;
                        while ((singleTile = BOARD_CONSTANTS.NW_LEVEL_TILE_REGEX.exec(rowResult))) {
                            if (!singleTile || !singleTile.length) {
                                throw new Error(
                                    'Unable to parse row '
                                    + rowIndex
                                    + ' unable to extract tile information.'
                                    );
                            }
                            var tileNumber = convertTileLocationToIndex(
                                getTileLocation(singleTile[0])
                                );
                            rowString += (tileCount > 0 ? ',' : '') + tileNumber;
                            tileCount++;
                        }

                        if (tileCount !== BOARD_CONSTANTS.NW_EXPECTED_NUM_TILES_PER_ROW) {
                            throw new Error(
                                'Unable to parse row. Row index '
                                + rowIndex
                                + ' had '
                                + tileCount
                                + ' tiles, was expecting: '
                                + BOARD_CONSTANTS.NW_EXPECTED_NUM_TILES_PER_ROW
                                );
                        }
                        boardJson.rows[rowIndex] = rowString;
                        rowIndex++;
                    }

                    if (rowIndex !== BOARD_CONSTANTS.NW_EXPECTED_NUM_ROWS) {
                        throw new Error(
                            'Unable to parse board. Map had '
                            + rowIndex
                            + ' rows, was expecting: '
                            + BOARD_CONSTANTS.NW_EXPECTED_NUM_ROWS
                            );
                    }

                    jsonData['board'] = boardJson;
                    LOGGER.info(
                        '[JSON CONVERTER] Completed conversion, final size is: '
                        + Math.ceil((JSON.stringify(jsonData).length) / 1024)
                        + ' Kb.'
                        + ' Original file size was: '
                        + Math.ceil(contents.length / 1024)
                        + ' Kb.'
                        );
                    callback(null, jsonData);
                } catch (err) {
                    callback({
                        'valid': false,
                        'message': err.message
                    });
                    return;
                }
            });
        });
    };

    /**
     * Render the defined template file using mustache to generate a
     * complete TMX format XML file.
     *
     * @param {JsonObejct} jsonLevel The parsed level file.
     * @param {String} tilesetImagePath The tileset image path to use in the new map.
     * @returns {String} XML string representing the new TMX map.
     */
    this.convertJsonLevelToTmx = function (jsonLevel, tilesetImagePath) {
        MUSTACHE.parse(TMX_FILE_TEMPLATE);
        return MUSTACHE.render(
            TMX_FILE_TEMPLATE,
            {
                'mapWidthInTiles': jsonLevel.widthInTiles,
                'mapHeightInTiles': jsonLevel.heightInTiles,
                'boardLayerTitle': jsonLevel.layerTitle || 'LevelTileLayer',
                'tilesetImagePath': tilesetImagePath,
                'boardData': jsonLevel.board.rows.join(',\n')
            }
        );
    };
}

module.exports = new BoardConverter();