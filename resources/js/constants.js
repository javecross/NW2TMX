/**
 * constants.js
 *
 *
 */

const CONSTANTS = {
    VERSION_NUMBER: '20170415-001',

    TILESET_FILE_REGEX: (/.png|.gif/),
    LEVEL_FILE_REGEX: (/.nw|.gmap/),

    ERROR_NO_TILESET_SELECTED: 'err-no-tileset',
    ERROR_MULTIPLE_TILESET_SELECTED: 'err-multiple-tileset',
    ERROR_INVALID_TILESET_FORMAT: 'err-invalid-tileset',
    ERROR_NO_SOURCE_SELECTED: 'err-no-sources',
    ERROR_INVALID_SOURCE_FORMAT: 'err-invalid-sources',
    ERROR_NO_VALID_SOURCE_FILES: 'err-no-valid-sources',
    WARN_SOME_INVALID_SOURCE_FILES: 'warn-some-invalid-sources',

    CONVERT_FILES_COMMAND: 'convert-files',
    COMPLETED_CONVERSION_COMMAND: 'convert-nw-files-complete',
    TMX_FILE_EXTENSION: 'tmx',
    GITHUB_SOURCE_LINK: 'https://github.com/javecross/NW2TMX',

    SHOW_OPEN_SOURCE_MODAL: 'open-source-view',
    SHOW_ABOUT_APP_MODAL: 'about-nw-to-tmx'
};

module.exports = Object.freeze(CONSTANTS);

