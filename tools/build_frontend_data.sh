#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <routes_geojson> <la_geojson> <rpt_geojson> [output_dir]" >&2
  exit 1
fi

ROUTES_GEOJSON="$1"
LA_GEOJSON="$2"
RPT_GEOJSON="$3"
OUTPUT_DIR="${4:-public}"

python3 tools/build_frontend_data.py \
  "$ROUTES_GEOJSON" \
  "$LA_GEOJSON" \
  "$RPT_GEOJSON" \
  --output-dir "$OUTPUT_DIR" \
  --data-dir data \
  --parquet-dir data/parquet
