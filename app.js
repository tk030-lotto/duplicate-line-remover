(function() {
    'use strict';

    // DOM要素の参照ヘルパー
    const $ = (id) => document.getElementById(id);

    // メインエディタ・ボタン要素
    const inputText = $('inputText');
    const outputText = $('outputText');
    const inputPane = $('inputPane');
    const dedupeBtn = $('dedupeBtn');
    const extractDupsBtn = $('extractDupsBtn');
    const undoBtn = $('undoBtn');
    const clearBtn = $('clearBtn');
    const copyBtn = $('copyBtn');
    const downloadBtn = $('downloadBtn');
    const applyInputBtn = $('applyInputBtn');
    const openFileBtn = $('openFileBtn');
    const fileInput = $('fileInput');

    // 処理オプション要素
    const optTrim = $('optTrim');
    const optIgnoreCase = $('optIgnoreCase');
    const optEmptyLines = $('optEmptyLines');
    const optSort = $('optSort');

    // カウンター & ステータス表示要素
    const inputBadge = $('inputBadge');
    const outputBadge = $('outputBadge');
    const statusMessage = $('statusMessage');
    const statInputLines = $('statInputLines');
    const statOutputLines = $('statOutputLines');
    const statRemovedLines = $('statRemovedLines');
    const statReductionRate = $('statReductionRate');

    const FileIO = window.DedupeFileIO;
    const History = window.DedupeHistory;

    // 実行状態
    // lastExecutedInput は「実行したときの入力文字列そのもの」。
    // 行数だけでは、行数が同じ書き換えを検出できないため (F-01)。
    let currentMode = null; // 'dedupe' | 'extract' | null
    let lastExecutedInput = null;
    let lastExecutedLines = null;

    function getOptions() {
        return {
            isTrim: optTrim.checked,
            isIgnoreCase: optIgnoreCase.checked,
            emptyOption: optEmptyLines.value,
            sortOption: optSort.value
        };
    }

    function setOptions(opts) {
        if (!opts) return;
        optTrim.checked = Boolean(opts.isTrim);
        optIgnoreCase.checked = Boolean(opts.isIgnoreCase);
        optEmptyLines.value = opts.emptyOption || 'keep';
        optSort.value = opts.sortOption || 'none';
    }

    /**
     * 画面に出ている結果が、いまの入力に対する結果かどうか。
     * 統計バー・操作ボタン・案内文は、すべてこの1つの判定から導出する (F-01 / F-02)。
     */
    function isOutputCurrent() {
        return currentMode !== null && lastExecutedInput !== null && inputText.value === lastExecutedInput;
    }

    function captureSnapshot() {
        return {
            input: inputText.value,
            output: outputText.value,
            currentMode: currentMode,
            lastExecutedInput: lastExecutedInput,
            lastExecutedLines: lastExecutedLines,
            options: getOptions()
        };
    }

    function recordUndoSnapshot(snapshot) {
        History.push(snapshot);
        undoBtn.disabled = !History.canUndo();
    }

    function updateInputStats() {
        const stats = DedupeCore.getLineStats(inputText.value);
        inputBadge.textContent = stats.lines + ' 行 / ' + stats.chars + ' 文字';
        statInputLines.textContent = stats.lines;
    }

    function updateOutputStats() {
        const outStats = DedupeCore.getLineStats(outputText.value);
        outputBadge.textContent = outStats.lines + ' 行 / ' + outStats.chars + ' 文字';
        statOutputLines.textContent = outStats.lines;

        if (!currentMode) {
            statRemovedLines.textContent = '0';
            statReductionRate.textContent = '0%';
            return;
        }

        // 重複抽出モード、または入力がいまの結果と対応していない場合はハイフン表示
        if (currentMode === 'extract' || !isOutputCurrent() || !lastExecutedLines || lastExecutedLines <= 0) {
            statRemovedLines.textContent = '-';
            statReductionRate.textContent = '-';
            return;
        }

        const removed = lastExecutedLines - outStats.lines;
        const validRemoved = removed >= 0 ? removed : 0;
        statRemovedLines.textContent = validRemoved;
        statReductionRate.textContent = Math.round((validRemoved / lastExecutedLines) * 100) + '%';
    }

    function syncActionButtons() {
        const hasOutput = outputText.value.length > 0 && isOutputCurrent();
        copyBtn.disabled = !hasOutput;
        downloadBtn.disabled = !hasOutput;
        applyInputBtn.disabled = !hasOutput;
        undoBtn.disabled = !History.canUndo();
    }

    // 描画の入口（状態 → 表示の一方向）(F-04)
    function render() {
        updateInputStats();
        updateOutputStats();
        syncActionButtons();
    }

    function showStatus(msg, type = '') {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-message' + (type ? ' ' + type : '');
    }

    function resetOutputAndStats() {
        outputText.value = '';
        currentMode = null;
        lastExecutedInput = null;
        lastExecutedLines = null;
        render();
    }

    function applyUndo() {
        const state = History.pop();
        if (!state) return;

        inputText.value = state.input;
        outputText.value = state.output;
        currentMode = state.currentMode || null;
        lastExecutedInput = state.lastExecutedInput ?? null;
        lastExecutedLines = state.lastExecutedLines ?? null;
        setOptions(state.options);

        render();
        showStatus('直前の状態に復元しました。', 'info');
    }

    // 重複削除・抽出の実行制御
    function processText(mode) {
        try {
            const rawText = inputText.value;
            const options = getOptions();

            if (!rawText || (!rawText.trim() && options.emptyOption === 'keep')) {
                showStatus('入力内容が空です。テキストを入力または貼り付けてください。', 'error');
                return;
            }

            const prevSnapshot = captureSnapshot();
            const rawLines = DedupeCore.splitLines(rawText);

            let processedLines = [];
            if (mode === 'dedupe') {
                processedLines = DedupeCore.dedupeLines(rawLines, options);
            } else if (mode === 'extract') {
                processedLines = DedupeCore.extractDuplicateLines(rawLines, options);
            }

            if (options.sortOption !== 'none') {
                processedLines = DedupeCore.sortLines(processedLines, options.sortOption, options);
            }

            const result = processedLines.join('\n');
            const stateChanged = (prevSnapshot.output !== result) || (prevSnapshot.currentMode !== mode);
            if (stateChanged) {
                recordUndoSnapshot(prevSnapshot);
            }

            outputText.value = result;
            currentMode = mode;
            lastExecutedInput = rawText;
            lastExecutedLines = rawLines.length;

            render();

            const inLines = rawLines.length;
            const outLines = processedLines.length;

            if (mode === 'dedupe') {
                const removed = inLines - outLines;
                if (removed > 0) {
                    showStatus(removed + '行の重複を削除しました（' + inLines + '行 → ' + outLines + '行）。', 'success');
                } else {
                    showStatus('重複行は見つかりませんでした（' + inLines + '行）。', 'info');
                }
            } else {
                if (outLines > 0) {
                    showStatus('重複していた行を抽出しました（計 ' + outLines + '行）。', 'success');
                } else {
                    showStatus('重複している行は見つかりませんでした（' + inLines + '行）。', 'info');
                }
            }
        } catch (err) {
            console.error('処理エラー:', err);
            showStatus('処理中にエラーが発生しました: ' + (err.message || '予期せぬエラー'), 'error');
        }
    }

    // ファイル読み込み（ボタン経由・ドラッグ＆ドロップ共通）
    function loadFile(file) {
        FileIO.readTextFile(file, {
            onLoaded: function (text, meta) {
                recordUndoSnapshot(captureSnapshot());
                inputText.value = text;
                resetOutputAndStats();
                if (meta.isLarge) {
                    showStatus('大容量ファイル「' + meta.name + '」(' + meta.sizeMB + 'MB / ' + meta.encoding + ') を読み込みました。処理に時間がかかる場合があります。', 'info');
                } else {
                    showStatus('ファイル「' + meta.name + '」を読み込みました。', 'success');
                }
            },
            onError: function (message) {
                showStatus(message, 'error');
            }
        });
    }

    // イベントハンドラー設定
    dedupeBtn.addEventListener('click', () => processText('dedupe'));
    extractDupsBtn.addEventListener('click', () => processText('extract'));
    undoBtn.addEventListener('click', applyUndo);

    clearBtn.addEventListener('click', function() {
        if (!inputText.value && !outputText.value) return;
        recordUndoSnapshot(captureSnapshot());
        inputText.value = '';
        resetOutputAndStats();
        showStatus('入力をクリアしました。', 'info');
        inputText.focus();
    });

    applyInputBtn.addEventListener('click', function() {
        if (!outputText.value || !isOutputCurrent()) return;
        recordUndoSnapshot(captureSnapshot());
        inputText.value = outputText.value;
        resetOutputAndStats();
        showStatus('結果を入力エリアに反映しました。', 'info');
    });

    // オプション変更時の再実行ガイド通知
    [optTrim, optIgnoreCase, optEmptyLines, optSort].forEach((el) => {
        el.addEventListener('change', function() {
            if (currentMode !== null) {
                showStatus('処理オプションが変更されました。反映するには実行ボタンを押してください。', 'info');
            }
        });
    });

    // コピー機能（クリップボードAPI + フォールバック）
    copyBtn.addEventListener('click', async function() {
        const text = outputText.value;
        if (!text || !isOutputCurrent()) return;

        try {
            await navigator.clipboard.writeText(text);
            showStatus('処理結果をクリップボードにコピーしました。', 'success');
        } catch (err) {
            outputText.focus();
            outputText.select();
            try {
                document.execCommand('copy');
                showStatus('処理結果をクリップボードにコピーしました。', 'success');
            } catch (e) {
                showStatus('コピーに失敗しました。テキストを手動で選択してコピーしてください。', 'error');
            }
        }
    });

    // ファイルダウンロード（UTF-8 / BOMなし / LF のまま保存）
    downloadBtn.addEventListener('click', function() {
        const text = outputText.value;
        if (!text || !isOutputCurrent()) return;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'deduped_result.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('ファイルを保存しました (deduped_result.txt)', 'success');
    });

    // ファイル入力（ボタン経由）
    openFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        loadFile(file);
        fileInput.value = '';
    });

    // ドラッグ＆ドロップ対応
    ['dragenter', 'dragover'].forEach(name => {
        inputPane.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputPane.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(name => {
        inputPane.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputPane.classList.remove('dragover');
        }, false);
    });

    inputPane.addEventListener('drop', function(e) {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        if (files && files.length > 0) {
            loadFile(files[0]);
        }
    });

    // テキスト入力の監視（結果が古くなったことを伝える）
    inputText.addEventListener('input', function() {
        render();
        if (outputText.value.length > 0 && !isOutputCurrent()) {
            showStatus('入力が変更されました。表示中の結果は前回実行時のものです。もう一度実行してください。', 'info');
        } else {
            showStatus('', '');
        }
    });

    // キーボードショートカット (Ctrl + Enter / Cmd + Enter, Ctrl + Z)
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            dedupeBtn.click();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            const active = document.activeElement;
            const isEditorFocused = (active === inputText && inputText.value !== '') || active === outputText;
            if (!isEditorFocused && History.canUndo()) {
                e.preventDefault();
                applyUndo();
            }
        }
    });

    // 初期化
    render();
    inputText.focus();
})();
