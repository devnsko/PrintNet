#!/usr/bin/env bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables from .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Database connection parameters
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-printnet}"
DB_USER="${POSTGRES_USER:-postgres}"

# Function to run SQL file
run_sql() {
    local file=$1
    echo -e "${GREEN}Running $file...${NC}"
    PGPASSWORD=$POSTGRES_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$file"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Success${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
        exit 1
    fi
}

# Function to recreate database
recreate_db() {
    echo -e "${GREEN}Recreating database...${NC}"
    PGPASSWORD=$POSTGRES_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER postgres <<EOF
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;
EOF
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database recreated${NC}"
    else
        echo -e "${RED}✗ Failed to recreate database${NC}"
        exit 1
    fi
}

# Parse command line arguments
case "$1" in
    "reset")
        recreate_db
        ;;
    "migrate")
        ;;
    *)
        echo "Usage: $0 [reset|migrate]"
        echo "  reset   - Drop and recreate the database, then run all migrations"
        echo "  migrate - Run only new migrations"
        exit 1
        ;;
esac

# Run all migration files in order
for file in migrations/*.sql; do
    if [ -f "$file" ]; then
        run_sql "$file"
    fi
done

echo -e "${GREEN}All migrations completed successfully${NC}"