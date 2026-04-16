#!/bin/bash

# Neutron v10 Web - Quick Setup Script
set -e

echo "================================================"
echo "  Neutron v10 Web - Setup"
echo "================================================"
echo ""

# Create .env if not exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3.8+ is required${NC}"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js 18+ is required${NC}"
    exit 1
fi

echo -e "${BLUE}[1/4] Setting up backend...${NC}"
cd backend

if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

source venv/bin/activate
echo -e "${YELLOW}Installing Python dependencies...${NC}"
pip install -r requirements.txt --quiet

cd ..

echo -e "${BLUE}[2/4] Setting up frontend...${NC}"
cd frontend

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
    npm install --silent
fi

cd ..

echo -e "${BLUE}[3/4] Building frontend...${NC}"
cd frontend
npm run build --silent
cd ..

echo -e "${BLUE}[4/4] Checking SSH key...${NC}"
if [ ! -f ~/.ssh/neutron.key ]; then
    echo -e "${YELLOW}WARNING: SSH key not found at ~/.ssh/neutron.key${NC}"
    echo -e "${YELLOW}Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/neutron.key${NC}"
    echo ""
fi

echo ""
echo "================================================"
echo -e "${GREEN}  Neutron v10 Web is ready!${NC}"
echo "================================================"
echo ""
echo -e "${YELLOW}Start with: cd backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8080${NC}"
echo ""
echo -e "${YELLOW}URL: http://localhost:8080${NC}"
echo -e "${YELLOW}API Docs: http://localhost:8080/docs${NC}"
echo ""
