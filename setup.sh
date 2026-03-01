#!/bin/bash
set -e

echo "=== Deploy Panel Setup ==="

# Check for .env file
if [ ! -f .env.production ]; then
    echo "ERROR: .env.production not found!"
    echo "Copy .env.example to .env.production and fill in the values."
    exit 1
fi

# Load environment
export $(grep -v '^#' .env.production | xargs)

# Create SSL directory
mkdir -p nginx/ssl

# Build and start
echo "Building and starting services..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Wait for services
echo "Waiting for services to start..."
sleep 10

# Run migrations
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# Seed database
echo "Seeding database..."
docker compose -f docker-compose.prod.yml exec backend npx tsx prisma/seed.ts

echo ""
echo "=== Setup Complete ==="
echo "Deploy Panel is running!"
echo ""
echo "Access: http://localhost (or your configured domain)"
echo ""
echo "Admin login: xK7_sysroot_4dm"
echo "You will need to set up 2FA on first login."
echo ""
echo "Commands:"
echo "  docker compose -f docker-compose.prod.yml logs -f     # View logs"
echo "  docker compose -f docker-compose.prod.yml down         # Stop"
echo "  docker compose -f docker-compose.prod.yml up -d        # Start"
echo "  docker compose -f docker-compose.prod.yml restart      # Restart"
