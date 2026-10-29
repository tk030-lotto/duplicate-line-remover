@echo off
chcp 932 > nul
title 重複行削除ツール

:: 既定のWebブラウザで index.html を起動
start "" "%~dp0index.html"
exit
