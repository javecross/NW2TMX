/**
 * board-constants.js
 *
 *
 */

module.exports = Object.freeze({
    NW_TILE_ID_PATTERN: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    NW_LEVEL_HEADER: (/^GLEVNW01/),
    NW_FIRST_BOARD_REGEX: (/BOARD 0 0 64 0 .*/),
    NW_LAST_BOARD_REGEX: (/BOARD 0 63 64 0 .*/),
    NW_GENERAL_ROW_REGEX: (/BOARD 0 \d{1,2} \d{1,2} 0 (.{128})/g),
    NW_LEVEL_TILE_REGEX: (/.{2}/g),

    NW_EXPECTED_NUM_ROWS: 64,
    NW_EXPECTED_NUM_TILES_PER_ROW: 64,

    GMAP_FILE_HEADER_REGEX: (/GRMAP001/),
    GMAP_WIDTH_REGEX: (/WIDTH (\d+)/),
    GMAP_HEIGHT_REGEX: (/HEIGHT (\d+)/),
    GMAP_LEVEL_NAME_REGEX: (/\"(.*?\.nw)\"/g)
});


