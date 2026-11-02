/**
 * file-io.js - ファイル読み込みと文字コード判定
 *
 * DOM・UIに依存しない入出力ユーティリティ。
 * file:// 互換（ローカル起動・バッチ起動）のため classic script とし、
 * window.DedupeFileIO に公開する。
 */
(function (global) {
    'use strict';

    // バイナリ・非対応ファイル拡張子
    var UNSUPPORTED_EXTS = /\.(xlsx|xls|docx|doc|pptx|ppt|pdf|zip|rar|7z|tar|gz|png|jpg|jpeg|gif|webp|bmp|ico|mp3|mp4|wav|avi|mov|exe|dll|bin|iso|dmg)$/i;
    var MAX_LIMIT_SIZE = 20 * 1024 * 1024; // 20MB 上限
    var WARN_SIZE = 5 * 1024 * 1024;      // 5MB 警告

    /**
     * ArrayBuffer をテキストへ変換する（UTF-8 優先、不正なら Shift-JIS）
     * NUL バイトを含む場合は BINARY_FILE として例外を投げる。
     * @param {ArrayBuffer} buffer
     * @returns {{ text: string, encoding: string }}
     */
    function decodeBufferToText(buffer) {
        var bytes = new Uint8Array(buffer);
        var checkLen = Math.min(bytes.length, 8192);
        for (var i = 0; i < checkLen; i++) {
            if (bytes[i] === 0) {
                throw new Error('BINARY_FILE');
            }
        }
        try {
            var utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            return { text: utf8Decoder.decode(bytes), encoding: 'UTF-8' };
        } catch (e) {
            var sjisDecoder = new TextDecoder('shift-jis');
            return { text: sjisDecoder.decode(bytes), encoding: 'Shift-JIS' };
        }
    }

    /**
     * ファイルを読み込み、テキストと付帯情報をコールバックで返す。
     * @param {File} file
     * @param {{ onLoaded?: Function, onError?: Function }} handlers
     *   onLoaded(text, { encoding, sizeMB, name, isLarge })
     *   onError(message)
     */
    function readTextFile(file, handlers) {
        var onLoaded = handlers && handlers.onLoaded;
        var onError = handlers && handlers.onError;

        function fail(message) {
            if (onError) onError(message);
        }

        var sizeMB = (file.size / (1024 * 1024)).toFixed(1);

        if (UNSUPPORTED_EXTS.test(file.name || '')) {
            fail('非対応のファイル形式です。テキスト形式（.txt, .csv, .tsv, .log 等）のファイルを指定してください。');
            return;
        }

        if (file.size > MAX_LIMIT_SIZE) {
            fail('ファイルサイズが上限を超えています (' + sizeMB + 'MB)。ブラウザ保護のため、20MB以下のファイルを指定してください。');
            return;
        }

        var reader = new FileReader();
        reader.onload = function (evt) {
            try {
                var decoded = decodeBufferToText(evt.target.result);
                if (onLoaded) {
                    onLoaded(decoded.text || '', {
                        encoding: decoded.encoding,
                        sizeMB: sizeMB,
                        name: file.name,
                        isLarge: file.size > WARN_SIZE
                    });
                }
            } catch (err) {
                if (err && err.message === 'BINARY_FILE') {
                    fail('バイナリファイルは読み込めません。テキスト形式のファイルを指定してください。');
                } else {
                    fail('ファイルの読み込みに失敗しました。');
                }
            }
        };
        reader.onerror = function () {
            fail('ファイルの読み込みに失敗しました。');
        };
        reader.readAsArrayBuffer(file);
    }

    global.DedupeFileIO = {
        UNSUPPORTED_EXTS: UNSUPPORTED_EXTS,
        MAX_LIMIT_SIZE: MAX_LIMIT_SIZE,
        WARN_SIZE: WARN_SIZE,
        decodeBufferToText: decodeBufferToText,
        readTextFile: readTextFile
    };
})(typeof window !== 'undefined' ? window : this);
