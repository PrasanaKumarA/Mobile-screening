@echo off
set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;%LOCALAPPDATA%\Programs\gh\bin;%PATH%"

echo ====================================================
echo  MobileMirror Studio - Push to GitHub
echo ====================================================
echo.

git status
echo.
echo Pushing main branch to https://github.com/PrasanaKumarA/Mobile-screening.git ...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Code successfully pushed to GitHub!
    goto end
)

echo.
echo [AUTH REQUIRED] Opening GitHub browser authentication...
gh auth login -h github.com -p https -w
call gh auth setup-git
git push -u origin main

:end
