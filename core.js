/**
 * core.js - 重複行削除・抽出コアエンジン（純粋ロジック層）
 * 
 * DOM・UIに依存せず、純粋な文字列・配列操作のみを提供します。
 * file:/// 互換性（ローカル起動・バッチ起動）のため、グローバルオブジェクト window.DedupeCore に公開します。
 */
(function(global) {
    'use strict';

    /**
     * テキストを行配列に分割
     * CRLF / CR を正規化し、末尾の単一改行は行数として過剰カウントしないよう補正
     * @param {string} text 
     * @returns {string[]}
     */
    function splitLines(text) {
        if (!text) return [];
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const trimmedEnd = normalized.replace(/\n$/, '');
        return trimmedEnd === '' ? [] : trimmedEnd.split('\n');
    }

    /**
     * テキストの行数および文字数を計算
     * @param {string} text 
     * @returns {{ lines: number, chars: number }}
     */
    function getLineStats(text) {
        if (!text) return { lines: 0, chars: 0 };
        const lines = splitLines(text);
        return { lines: lines.length, chars: text.length };
    }

    /**
     * 比較用キーの生成
     * @param {string} line 
     * @param {boolean} isTrim 
     * @param {boolean} isIgnoreCase 
     * @returns {string}
     */
    function createCompareKey(line, isTrim, isIgnoreCase) {
        let key = line;
        if (isTrim) {
            key = key.trim();
        }
        if (isIgnoreCase) {
            key = key.toLowerCase();
        }
        return key;
    }

    /**
     * 重複行を削除し、ユニークな行のみを残す（出現順序維持）
     * @param {string[]} rawLines 
     * @param {Object} options 
     * @returns {string[]}
     */
    function dedupeLines(rawLines, options) {
        const opts = options || {};
        const isTrim = Boolean(opts.isTrim);
        const isIgnoreCase = Boolean(opts.isIgnoreCase);
        const emptyOption = opts.emptyOption || 'keep'; // 'keep', 'dedupe', 'remove'

        const seenKeys = new Set();
        let seenEmpty = false;
        const result = [];

        for (const line of rawLines) {
            const isEmpty = isTrim ? (line.trim() === '') : (line === '');

            if (isEmpty) {
                if (emptyOption === 'keep') {
                    result.push(line);
                } else if (emptyOption === 'dedupe') {
                    if (!seenEmpty) {
                        seenEmpty = true;
                        result.push(line);
                    }
                }
                // 'remove' はスキップ
                continue;
            }

            const key = createCompareKey(line, isTrim, isIgnoreCase);
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                result.push(line);
            }
        }

        return result;
    }

    /**
     * 2回以上現れた重複行のみを抽出（初出順序維持）
     * @param {string[]} rawLines 
     * @param {Object} options 
     * @returns {string[]}
     */
    function extractDuplicateLines(rawLines, options) {
        const opts = options || {};
        const isTrim = Boolean(opts.isTrim);
        const isIgnoreCase = Boolean(opts.isIgnoreCase);
        const emptyOption = opts.emptyOption || 'keep';

        const counts = new Map();
        const firstInstances = new Map();

        for (const line of rawLines) {
            const isEmpty = isTrim ? (line.trim() === '') : (line === '');
            if (isEmpty && emptyOption === 'remove') {
                continue;
            }

            const key = createCompareKey(line, isTrim, isIgnoreCase);
            counts.set(key, (counts.get(key) || 0) + 1);
            if (!firstInstances.has(key)) {
                firstInstances.set(key, line);
            }
        }

        const result = [];
        for (const [key, count] of counts.entries()) {
            if (count > 1) {
                result.push(firstInstances.get(key));
            }
        }

        return result;
    }

    /**
     * 行配列のソート
     * @param {string[]} lines 
     * @param {string} sortOption 'none' | 'asc' | 'desc'
     * @returns {string[]} ソート済み配列
     */
    function sortLines(lines, sortOption) {
        if (!sortOption || sortOption === 'none') {
            return [...lines];
        }
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        const copy = [...lines];
        if (sortOption === 'asc') {
            copy.sort((a, b) => collator.compare(a, b));
        } else if (sortOption === 'desc') {
            copy.sort((a, b) => collator.compare(b, a));
        }
        return copy;
    }

    // 公開API
    global.DedupeCore = {
        splitLines: splitLines,
        getLineStats: getLineStats,
        createCompareKey: createCompareKey,
        dedupeLines: dedupeLines,
        extractDuplicateLines: extractDuplicateLines,
        sortLines: sortLines
    };
})(typeof window !== 'undefined' ? window : this);
