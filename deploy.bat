@echo off
cd /d C:\Users\Owner\Documents\shift-app
set /p msg="コミットメッセージを入力してください: "
git add .
git commit -m "%msg%"
git push
echo.
echo デプロイ完了！Netlify が自動で更新されます。
pause
