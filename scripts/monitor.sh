#!/bin/bash

# Geez Bingo Monitoring Script
set -e

echo "📊 Geez Bingo System Monitoring"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Docker services
echo -e "\n🐳 Docker Services Status:"
for service in $(docker-compose ps --services); do
    status=$(docker-compose ps $service | grep -o "Up\|Exit\|Restarting")
    if [ "$status" = "Up" ]; then
        echo -e "  ${GREEN}✅ $service: $status${NC}"
    else
        echo -e "  ${RED}❌ $service: $status${NC}"
    fi
done

# Check disk usage
echo -e "\n💾 Disk Usage:"
df -h / | tail -1

# Check memory usage
echo -e "\n🧠 Memory Usage:"
free -h

# Check CPU load
echo -e "\n⚡ CPU Load:"
uptime

# Check service health
echo -e "\n🏥 Service Health Checks:"

# Backend health
if curl -s http://localhost:5000/health > /dev/null; then
    echo -e "  ${GREEN}✅ Backend API: Healthy${NC}"
else
    echo -e "  ${RED}❌ Backend API: Unhealthy${NC}"
fi

# Database health
if docker-compose exec -T postgres pg_isready -U postgres > /dev/null; then
    echo -e "  ${GREEN}✅ PostgreSQL: Healthy${NC}"
else
    echo -e "  ${RED}❌ PostgreSQL: Unhealthy${NC}"
fi

# Redis health
if docker-compose exec -T redis redis-cli ping | grep -q PONG; then
    echo -e "  ${GREEN}✅ Redis: Healthy${NC}"
else
    echo -e "  ${RED}❌ Redis: Unhealthy${NC}"
fi

# Check active games
echo -e "\n🎮 Active Games:"
ACTIVE_GAMES=$(curl -s http://localhost:5000/api/games/active/count | jq -r '.count')
echo -e "  Active Games: ${YELLOW}$ACTIVE_GAMES${NC}"

# Check total players
echo -e "\n👥 Player Statistics:"
TOTAL_PLAYERS=$(curl -s http://localhost:5000/api/stats/players | jq -r '.total')
ACTIVE_PLAYERS=$(curl -s http://localhost:5000/api/stats/players | jq -r '.active')
echo -e "  Total Players: ${YELLOW}$TOTAL_PLAYERS${NC}"
echo -e "  Active Players: ${YELLOW}$ACTIVE_PLAYERS${NC}"

# Check system logs for errors
echo -e "\n📝 Recent Errors:"
docker-compose logs --tail=50 backend 2>/dev/null | grep -i error | tail -5 || echo "  No recent errors found"

# Check certificate expiry
echo -e "\n🔐 SSL Certificate Status:"
if [ -f "nginx/ssl/live/$(cat .env | grep DOMAIN | cut -d '=' -f2)/fullchain.pem" ]; then
    EXPIRY_DATE=$(openssl x509 -enddate -noout -in "nginx/ssl/live/$(cat .env | grep DOMAIN | cut -d '=' -f2)/fullchain.pem" | cut -d '=' -f2)
    DAYS_LEFT=$(( ($(date -d "$EXPIRY_DATE" +%s) - $(date +%s)) / 86400 ))
    if [ $DAYS_LEFT -lt 30 ]; then
        echo -e "  ${RED}⚠️ Certificate expires in $DAYS_LEFT days${NC}"
    else
        echo -e "  ${GREEN}✅ Certificate expires on: $EXPIRY_DATE ($DAYS_LEFT days left)${NC}"
    fi
fi

echo -e "\n${GREEN}✅ Monitoring check completed${NC}"
