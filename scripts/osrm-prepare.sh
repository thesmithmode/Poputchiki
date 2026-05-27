#!/bin/sh
set -e

DATA_DIR=/data
PBF_URL="${OSRM_PBF_URL:-https://download.openstreetmap.fr/extracts/russia/volga_federal_district/tatarstan_republic-latest.osm.pbf}"
PBF_FILE="$DATA_DIR/tatarstan.osm.pbf"
OSRM_FILE="$DATA_DIR/tatarstan.osrm"

if [ -f "$OSRM_FILE.cell_metrics" ]; then
  echo "OSRM data already prepared, skipping."
  exit 0
fi

mkdir -p "$DATA_DIR"

if [ ! -f "$PBF_FILE" ]; then
  echo "Downloading PBF from $PBF_URL ..."
  if command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$PBF_FILE" "$PBF_URL"
  elif command -v curl >/dev/null 2>&1; then
    curl -fSL -o "$PBF_FILE" "$PBF_URL"
  else
    apt-get update -qq && apt-get install -y -qq wget >/dev/null 2>&1
    wget -q --show-progress -O "$PBF_FILE" "$PBF_URL"
  fi
fi

echo "Extracting..."
osrm-extract -p /opt/car.lua "$PBF_FILE"

echo "Partitioning (MLD)..."
osrm-partition "$OSRM_FILE"

echo "Customizing..."
osrm-customize "$OSRM_FILE"

echo "OSRM data prepared successfully."
