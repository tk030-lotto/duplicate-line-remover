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

    // 実行状態 & Undo履歴スタック（最大20世代・合計1,000万文字上限）
    let currentMode = null; // 'dedupe' | 'extract' | null
    let lastExecutedInputLines = null; // 直前実行時の入力行数（統計バー整合性維持用）
    const undoStack = [];
    const MAX_UNDO = 20;
    const MAX_UNDO_CHARS = 10 * 1000 * 1000;
    let totalUndoChars = 0;

    // バイナリ・非対応ファイル拡張子
    const UNSUPPORTED_EXTS = /\.(xlsx|xls|docx|doc|pptx|ppt|pdf|zip|rar|7z|tar|gz|png|jpg|jpeg|gif|webp|bmp|ico|mp3|mp4|wav|avi|mov|exe|dll|bin|iso|dmg)$/i;

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

    function captureSnapshot() {
        return {
            input: inputText.value,
            output: outputText.value,
            currentMode: currentMode,
            lastExecutedInputLines: lastExecutedInputLines,
            options: getOptions()
        };
    }

    function recordUndoSnapshot(snapshot) {
        const entryChars = (snapshot.input ? snapshot.input.length : 0) + (snapshot.output ? snapshot.output.length : 0);
        undoStack.push(snapshot);
        totalUndoChars += entryChars;

        while (undoStack.length > MAX_UNDO || (undoStack.length > 1 && totalUndoChars > MAX_UNDO_CHARS)) {
            const removed = undoStack.shift();
            totalUndoChars -= ((removed.input ? removed.input.length : 0) + (removed.output ? removed.output.length : 0));
        }
        undoBtn.disabled = undoStack.length === 0;
    }

    function syncActionButtons() {
        const hasOutput = outputText.value.length > 0;
        copyBtn.disabled = !hasOutput;
        downloadBtn.disabled = !hasOutput;
        applyInputBtn.disabled = !hasOutput;
        undoBtn.disabled = undoStack.length === 0;
    }

    function resetOutputAndStats() {
        outputText.value = '';
        currentMode = null;
        lastExecutedInputLines = null;
        updateOutputStats();
        syncActionButtons();
    }

    function applyUndo() {
        if (undoStack.length === 0) return;
        const state = undoStack.pop();
        totalUndoChars -= ((state.input ? state.input.length : 0) + (state.output ? state.output.length : 0));
        if (totalUndoChars < 0) totalUndoChars = 0;

        inputText.value = state.input;
        outputText.value = state.output;
        currentMode = state.currentMode || null;
        lastExecutedInputLines = state.lastExecutedInputLines ?? null;
        setOptions(state.options);

        updateInputStats();
        updateOutputStats();
        syncActionButtons();
        showStatus('直前の状態に復元しました。', 'info');
    }

    function updateInputStats() {
        const stats = DedupeCore.getLineStats(inputText.value);
        inputBadge.textContent = stats.lines + ' 行 / ' + stats.chars + ' 文字';
        statInputLines.textContent = stats.lines;
    }

    function updateOutputStats() {
        const currentInStats = DedupeCore.getLineStats(inputText.value);
        const outStats = DedupeCore.getLineStats(outputText.value);
        outputBadge.textContent = outStats.lines + ' 行 / ' + outStats.chars + ' 文字';
        statOutputLines.textContent = outStats.lines;

        if (!currentMode) {
            statRemovedLines.textContent = '0';
            statReductionRate.textContent = '0%';
            return;
        }

        if (currentMode === 'extract' || (lastExecutedInputLines !== null && currentInStats.lines !== lastExecutedInputLines)) {
            // 重複抽出モード、または実行後に入力行数が変化して未実行状態の場合はハイフン表示
            statRemovedLines.textContent = '-';
            statReductionRate.textContent = '-';
        } else if (lastExecutedInputLines > 0) {
            const removed = lastExecutedInputLines - outStats.lines;
            const validRemoved = removed >= 0 ? removed : 0;
            statRemovedLines.textContent = validRemoved;
            const rate = Math.round((validRemoved / lastExecutedInputLines) * 100);
            statReductionRate.textContent = rate + '%';
        } else {
            statRemovedLines.textContent = '0';
            statReductionRate.textContent = '0%';
        }
    }

    function showStatus(msg, type = '') {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-message' + (type ? ' ' + type : '');
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
            lastExecutedInputLines = rawLines.length;

            updateInputStats();
            updateOutputStats();
            syncActionButtons();

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

    // イベントハンドラー設定
    dedupeBtn.addEventListener('click', () => processText('dedupe'));
    extractDupsBtn.addEventListener('click', () => processText('extract'));
    undoBtn.addEventListener('click', applyUndo);

    clearBtn.addEventListener('click', function() {
        if (!inputText.value && !outputText.value) return;
        recordUndoSnapshot(captureSnapshot());
        inputText.value = '';
        resetOutputAndStats();
        updateInputStats();
        showStatus('入力をクリアしました。', 'info');
        inputText.focus();
    });

    applyInputBtn.addEventListener('click', function() {
        if (!outputText.value) return;
        recordUndoSnapshot(captureSnapshot());
        inputText.value = outputText.value;
        resetOutputAndStats();
        updateInputStats();
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
        if (!text) return;

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

    // ファイルダウンロード
    downloadBtn.addEventListener('click', function() {
        const text = outputText.value;
        if (!text) return;

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
        readFile(file);
        fileInput.value = '';
    });

    function decodeBufferToText(buffer) {
        const bytes = new Uint8Array(buffer);
        // NULバイト検査（バイナリファイル遮断）
        const checkLen = Math.min(bytes.length, 8192);
        for (let i = 0; i < checkLen; i++) {
            if (bytes[i] === 0) {
                throw new Error('BINARY_FILE');
            }
        }
        try {
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            return { text: utf8Decoder.decode(bytes), encoding: 'UTF-8' };
        } catch (e) {
            const sjisDecoder = new TextDecoder('shift-jis');
            return { text: sjisDecoder.decode(bytes), encoding: 'Shift-JIS' };
        }
    }

    function readFile(file) {
        const MAX_LIMIT_SIZE = 20 * 1024 * 1024; // 20MB 上限
        const WARN_SIZE = 5 * 1024 * 1024;      // 5MB 警告
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

        if (UNSUPPORTED_EXTS.test(file.name || '')) {
            showStatus('非対応のファイル形式です。テキスト形式（.txt, .csv, .tsv, .log 等）のファイルを指定してください。', 'error');
            return;
        }

        if (file.size > MAX_LIMIT_SIZE) {
            showStatus('ファイルサイズが上限を超えています (' + sizeMB + 'MB)。ブラウザ保護のため、20MB以下のファイルを指定してください。', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const decoded = decodeBufferToText(evt.target.result);
                recordUndoSnapshot(captureSnapshot());
                inputText.value = decoded.text || '';
                resetOutputAndStats();
                updateInputStats();
                if (file.size > WARN_SIZE) {
                    showStatus('大容量ファイル「' + file.name + '」(' + sizeMB + 'MB / ' + decoded.encoding + ') を読み込みました。処理に時間がかかる場合があります。', 'info');
                } else {
                    showStatus('ファイル「' + file.name + '」を読み込みました。', 'success');
                }
            } catch (err) {
                if (err && err.message === 'BINARY_FILE') {
                    showStatus('バイナリファイルは読み込めません。テキスト形式のファイルを指定してください。', 'error');
                } else {
                    showStatus('ファイルの読み込みに失敗しました。', 'error');
                }
            }
        };
        reader.onerror = function() {
            showStatus('ファイルの読み込みに失敗しました。', 'error');
        };
        reader.readAsArrayBuffer(file);
    }

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
            readFile(files[0]);
        }
    });

    // テキスト入力の監視（カウント同期と統計バー整合性維持）
    inputText.addEventListener('input', function() {
        updateInputStats();
        updateOutputStats();
        showStatus('', '');
    });

    // キーボードショートカット (Ctrl + Enter / Cmd + Enter, Ctrl + Z)
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            dedupeBtn.click();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            const active = document.activeElement;
            const isEditorFocused = (active === inputText && inputText.value !== '') || active === outputText;
            if (!isEditorFocused && undoStack.length > 0) {
                e.preventDefault();
                applyUndo();
            }
        }
    });

    // 初期化
    updateInputStats();
    updateOutputStats();
    syncActionButtons();
    inputText.focus();
})();
