@echo off
REM Neutron v10 Web - Quick Setup Script for Windows
echo ================================================
echo   Neutron v10 Web - Setup
echo ================================================
echo.

REM Create .env if not exists
if not exist ".env" (
    echo Creating .env from .env.example...
    copy .env.example .env
)

REM Check Python
set PYTHON_CMD=python
python --version >nul 2>&1
if not errorlevel 1 goto python_ok

set PYTHON_CMD=py
py --version >nul 2>&1
if not errorlevel 1 goto python_ok

echo Error: Python 3.8+ is required
exit /b 1

:python_ok

REM Check Node
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js 18+ is required
    exit /b 1
)

echo [1/4] Setting up backend...
cd backend
if not exist "venv" (
    echo Creating Python virtual environment...
    %PYTHON_CMD% -m venv venv
)
call venv\Scripts\activate
echo Installing Python dependencies...
pip install -r requirements.txt --quiet
cd ..

echo [2/4] Setting up frontend...
cd frontend
if not exist "node_modules" (
    echo Installing Node.js dependencies...
    call npm install --silent
)
cd ..

echo [3/4] Building frontend...
cd frontend
call npm run build
cd ..

echo [4/4] Checking SSH key...
if not exist "%USERPROFILE%\.ssh\neutron.key" (
    echo.
    echo WARNING: SSH key not found at %%USERPROFILE%%\.ssh\neutron.key
    echo Generate one with: ssh-keygen -t ed25519 -f %%USERPROFILE%%\.ssh\neutron.key
    echo.
)

echo.
echo ================================================
echo   Neutron v10 Web is ready!
echo ================================================
echo.
echo Start with: cd backend ^&^& venv\Scripts\activate ^&^& uvicorn main:app --host 0.0.0.0 --port 8080
echo.
echo URL: http://localhost:8080
echo API Docs: http://localhost:8080/docs
echo.
pause
