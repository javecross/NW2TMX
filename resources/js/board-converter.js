/**
 * Board Converter.
 *
 * <p>
 * Converts a given NW format file into various other formats. Both JSON and 'TMX' file formats
 * are an option.
 *
 * @since 12/04/2017
 * @author JaveCross
 */
/* global __dirname */
const
    FILE_SYSTEM = require('fs'),
    MUSTACHE = require('mustache'),
    LOGGER = require('electron-log'),
    NW_LEVEL_HEADER = (/^GLEVNW01/),
    NW_FIRST_BOARD_REGEX = (/BOARD 0 0 64 0 .*/),
    NW_LAST_BOARD_REGEX = (/BOARD 0 63 64 0 .*/),
    NW_GENERAL_ROW_REGEX = (/BOARD 0 \d{1,2} \d{1,2} 0 (.{128})/g),
    NW_LEVEL_TILE_REGEX = (/.{2}/g),
    NW_EXPECTED_NUM_ROWS = 64,
    NW_EXPECTED_NUM_TILES_PER_ROW = 64,
    NW_TILE_ID_PATTERN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    TMX_FILE_TEMPLATE_PATH = '/../templates/tiled-map-format.xml',
    TMX_FILE_TEMPLATE = FILE_SYSTEM.readFileSync(__dirname + TMX_FILE_TEMPLATE_PATH, 'UTF-8');

function getTileLocation(tileId) {
    if (!tileId || tileId.length !== 2) {
        throw new Error('Invalid tile ID length');
    }

    var firstChar = tileId[0],
        secondChar = tileId[1],
        firstCharIndex = NW_TILE_ID_PATTERN.indexOf(firstChar),
        secondCharIndex = NW_TILE_ID_PATTERN.indexOf(secondChar),
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
    if (!NW_LEVEL_HEADER.test(levelData)) {
        callback({
            'valid': false,
            'message': 'Invalid level header, requires "GLEVNW01" in the header.'
        });
        return;
    }
    if (!NW_FIRST_BOARD_REGEX.test(levelData)) {
        callback({
            'valid': false,
            'message': 'Invalid or corrupt level board. Unable to locate row 0 0 64 0.'
        });
        return;
    }
    if (!NW_LAST_BOARD_REGEX.test(levelData)) {
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

function BoardConverter() {

    this.convertNwFileToJson = function (filePath, callback, x, y) {
        if (!filePath || !filePath.length) {
            throw new Error('Filepath param is required.');
        }
        if (x === undefined) {
            x = 0;
        }
        if (y === undefined) {
            y = 0;
        }

        var jsonData = {
            'x': x,
            'y': y,
            'filePath': filePath
        };

        FILE_SYSTEM.readFile(filePath, "UTF-8", (err, contents) => {
            if (err) {
                throw err;
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
                    while ((singleRow = NW_GENERAL_ROW_REGEX.exec(contents))) {
                        if (!singleRow || singleRow.length !== 2) {
                            throw new Error(
                                'Unable to parse row '
                                + rowIndex
                                + ' unable to find row data.'
                                );
                        }

                        var rowString = '',
                            tileCount = 0;
                        while ((singleTile = NW_LEVEL_TILE_REGEX.exec(singleRow[1]))) {
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

                        if (tileCount !== NW_EXPECTED_NUM_TILES_PER_ROW) {
                            throw new Error(
                                'Unable to parse row. Row index '
                                + rowIndex
                                + ' had '
                                + tileCount
                                + ' tiles, was expecting: '
                                + NW_EXPECTED_NUM_TILES_PER_ROW
                                );
                        }
                        boardJson.rows[rowIndex] = rowString;
                        rowIndex++;
                    }

                    if (rowIndex !== NW_EXPECTED_NUM_ROWS) {
                        throw new Error(
                            'Unable to parse board. Map had '
                            + rowIndex
                            + ' rows, was expecting: '
                            + NW_EXPECTED_NUM_ROWS
                            );
                    }

                    jsonData['board'] = boardJson;
                    LOGGER.debug(
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

    this.convertJsonLevelToTmx = function (jsonLevel, tilesetImagePath) {
        MUSTACHE.parse(TMX_FILE_TEMPLATE);
        return MUSTACHE.render(
            TMX_FILE_TEMPLATE,
            {
                'tilesetImagePath': tilesetImagePath,
                'boardData': jsonLevel.board.rows.join(',\n')
            }
        );
    };
}

module.exports = new BoardConverter();