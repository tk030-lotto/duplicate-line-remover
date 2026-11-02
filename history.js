/**
 * history.js - Undo 履歴スタック
 *
 * 最大20世代・合計1,000万文字の上限つき。
 * file:// 互換のため classic script とし、window.DedupeHistory に公開する。
 */
(function (global) {
    'use strict';

    var MAX_UNDO = 20;
    var MAX_UNDO_CHARS = 10 * 1000 * 1000;

    var stack = [];
    var totalChars = 0;

    function sizeOf(snapshot) {
        if (!snapshot) return 0;
        return (snapshot.input ? snapshot.input.length : 0) + (snapshot.output ? snapshot.output.length : 0);
    }

    /**
     * 状態を1世代として積む。上限を超えた古い世代は捨てる。
     * @param {Object} snapshot
     * @returns {number} 積んだあとの世代数
     */
    function push(snapshot) {
        stack.push(snapshot);
        totalChars += sizeOf(snapshot);

        while (stack.length > MAX_UNDO || (stack.length > 1 && totalChars > MAX_UNDO_CHARS)) {
            totalChars -= sizeOf(stack.shift());
        }
        return stack.length;
    }

    /**
     * 直前の状態を取り出す（戻せないときは null）
     * @returns {Object|null}
     */
    function pop() {
        if (stack.length === 0) return null;
        var state = stack.pop();
        totalChars -= sizeOf(state);
        if (totalChars < 0) totalChars = 0;
        return state;
    }

    function canUndo() {
        return stack.length > 0;
    }

    function count() {
        return stack.length;
    }

    function clear() {
        stack.length = 0;
        totalChars = 0;
    }

    global.DedupeHistory = {
        MAX_UNDO: MAX_UNDO,
        MAX_UNDO_CHARS: MAX_UNDO_CHARS,
        push: push,
        pop: pop,
        canUndo: canUndo,
        count: count,
        clear: clear
    };
})(typeof window !== 'undefined' ? window : this);
