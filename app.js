        (function() {
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

            // 実行状態 & Undo履歴スタック
            let currentMode = null; // 'dedupe' | 'extract' | null
            const undoStack = [];
            const MAX_UNDO = 20;

            function pushUndoState() {
                undoStack.push({
                    input: inputText.value,
                    output: outputText.value,
                    currentMode: currentMode,
                    optTrim: optTrim.checked,
                    optIgnoreCase: optIgnoreCase.checked,
                    optEmptyLines: optEmptyLines.value,
                    optSort: optSort.value
                });
                if (undoStack.length > MAX_UNDO) {
                    undoStack.shift();
                }
                undoBtn.disabled = false;
            }

            function applyUndo() {
                if (undoStack.length === 0) return;
                const state = undoStack.pop();
                inputText.value = state.input;
                outputText.value = state.output;
                currentMode = state.currentMode || null;
                optTrim.checked = state.optTrim;
                optIgnoreCase.checked = state.optIgnoreCase;
                optEmptyLines.value = state.optEmptyLines;
                optSort.value = state.optSort;

                updateInputStats();
                updateOutputStats();
                copyBtn.disabled = !outputText.value;
                downloadBtn.disabled = !outputText.value;
                undoBtn.disabled = undoStack.length === 0;
                showStatus('直前の状態に復元しました。', 'info');
            }

            function updateInputStats() {
                const stats = DedupeCore.getLineStats(inputText.value);
                inputBadge.textContent = stats.lines + ' 行 / ' + stats.chars + ' 文字';
                statInputLines.textContent = stats.lines;
            }

            function updateOutputStats() {
                const inStats = DedupeCore.getLineStats(inputText.value);
                const outStats = DedupeCore.getLineStats(outputText.value);
                outputBadge.textContent = outStats.lines + ' 行 / ' + outStats.chars + ' 文字';
                statOutputLines.textContent = outStats.lines;

                if (currentMode === 'extract') {
                    // 重複抽出モードでは「削除」「削減」ではないためハイフン表示
                    statRemovedLines.textContent = '-';
                    statReductionRate.textContent = '-';
                } else if (inStats.lines > 0) {
                    const removed = inStats.lines - outStats.lines;
                    statRemovedLines.textContent = removed >= 0 ? removed : 0;
                    const rate = Math.round(((removed > 0 ? removed : 0) / inStats.lines) * 100);
                    statReductionRate.textContent = rate + '%';
                } else {
                    statRemovedLines.textContent = '0';
                    statReductionRate.textContent = '0%';
                }
            }

            function showStatus(msg, type = '') {
                statusMessage.textContent = msg;
                statusMessage.className = 'status-message ' + type;
            }

            function clearStatus() {
                statusMessage.textContent = '';
                statusMessage.className = 'status-message';
            }

            // 重複削除・抽出の実行制御
            function processText(mode) {
                try {
                    const rawText = inputText.value;
                    if (!rawText.trim()) {
                        showStatus('入力内容が空です。テキストを入力または貼り付けてください。', 'error');
                        return;
                    }

                    pushUndoState();
                    currentMode = mode;

                    const rawLines = DedupeCore.splitLines(rawText);
                    const options = {
                        isTrim: optTrim.checked,
                        isIgnoreCase: optIgnoreCase.checked,
                        emptyOption: optEmptyLines.value,
                        sortOption: optSort.value
                    };

                    let processedLines = [];
                    if (mode === 'dedupe') {
                        processedLines = DedupeCore.dedupeLines(rawLines, options);
                    } else if (mode === 'extract') {
                        processedLines = DedupeCore.extractDuplicateLines(rawLines, options);
                    }

                    if (options.sortOption !== 'none') {
                        processedLines = DedupeCore.sortLines(processedLines, options.sortOption);
                    }

                    const result = processedLines.join('\n');
                    outputText.value = result;

                    updateOutputStats();
                    copyBtn.disabled = !result;
                    downloadBtn.disabled = !result;

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
                        showStatus('重複していた行を抽出しました（計 ' + outLines + '行）。', 'success');
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
                pushUndoState();
                inputText.value = '';
                outputText.value = '';
                currentMode = null;
                updateInputStats();
                updateOutputStats();
                copyBtn.disabled = true;
                downloadBtn.disabled = true;
                showStatus('入力をクリアしました。', 'info');
                inputText.focus();
            });

            applyInputBtn.addEventListener('click', function() {
                if (!outputText.value) return;
                pushUndoState();
                inputText.value = outputText.value;
                currentMode = null;
                updateInputStats();
                showStatus('結果を入力エリアに反映しました。', 'info');
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

            function readFile(file) {
                const MAX_LIMIT_SIZE = 20 * 1024 * 1024; // 20MB 上限
                const WARN_SIZE = 5 * 1024 * 1024;      // 5MB 警告
                const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

                if (file.size > MAX_LIMIT_SIZE) {
                    showStatus('ファイルサイズが上限を超えています (' + sizeMB + 'MB)。ブラウザ保護のため、20MB以下のファイルを指定してください。', 'error');
                    return;
                }

                const reader = new FileReader();
                reader.onload = function(evt) {
                    pushUndoState();
                    inputText.value = evt.target.result || '';
                    currentMode = null;
                    updateInputStats();
                    if (file.size > WARN_SIZE) {
                        showStatus('大容量ファイル「' + file.name + '」(' + sizeMB + 'MB) を読み込みました。処理に時間がかかる場合があります。', 'info');
                    } else {
                        showStatus('ファイル「' + file.name + '」を読み込みました。', 'success');
                    }
                };
                reader.onerror = function() {
                    showStatus('ファイルの読み込みに失敗しました。', 'error');
                };
                reader.readAsText(file, 'UTF-8');
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

            // テキスト入力の監視（ステータス消去とカウント同期）
            inputText.addEventListener('input', function() {
                updateInputStats();
                clearStatus();
            });

            // キーボードショートカット (Ctrl + Enter / Cmd + Enter)
            document.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    dedupeBtn.click();
                } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    if (document.activeElement !== inputText && document.activeElement !== outputText) {
                        e.preventDefault();
                        applyUndo();
                    }
                }
            });

            // 初期化
            updateInputStats();
            updateOutputStats();
            inputText.focus();
        })();
