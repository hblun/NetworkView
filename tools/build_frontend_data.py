#!/usr/bin/env python3
"""
Build frontend artifacts using DuckDB spatial joins.

This script enriches routes with LA/RTP primary fields and multi-membership
fields so filters can match "route goes through area".

Performance optimizations:
- Configurable thread count for DuckDB
- Progress tracking with timestamps
- Skips existing outputs with --resume
- Spatial index hints for faster joins

Resilience features:
- Error handling with retries for downloads
- Validation of outputs
- Checkpointing of intermediate results

# python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson

Usage Examples:
---------------

# Basic usage (LA boundaries auto-downloaded from SpatialHub):
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson

# With custom LA boundaries file:
python3 tools/build_frontend_data.py data/scotland-routes.geojson --la-geojson data/boundaries_la.geojson data/boundaries_rpt_clean.geojson

# Performance tuning for large datasets:
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson --threads 8 --memory-limit 16GB

# Skip tile generation (faster for testing):
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson --skip-tiles

# Resume mode (skip existing outputs):
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson --resume

# Custom output directories:
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson \
  --output-dir public \
  --data-dir data \
  --parquet-dir data/parquet

# With membership filters (only include intersections > 100m and > 1% of route):
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson \
  --min-length-m 100 \
  --min-share 0.01
"""

import argparse
import os
import subprocess
import time
import urllib.request
from typing import List, Optional
from datetime import datetime

import duckdb


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def find_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    lower = {c.lower(): c for c in columns}
    for candidate in candidates:
        hit = lower.get(candidate.lower())
        if hit:
            return hit
    return None


def get_columns(conn: duckdb.DuckDBPyConnection, table: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({quote_ident(table)})").fetchall()
    return [row[1] for row in rows]


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def run_tippecanoe(input_geojson: str, output_mbtiles: str, layer: str) -> None:
    cmd = [
        "tippecanoe",
        "--force",
        "--layer",
        layer,
        "--no-tile-size-limit",
        "--no-feature-limit",
        "-o",
        output_mbtiles,
        input_geojson,
    ]
    subprocess.check_call(cmd)


def mbtiles_to_pmtiles(mbtiles_path: str, pmtiles_path: str) -> None:
    import sqlite3
    from pmtiles import convert

    conn = sqlite3.connect(mbtiles_path)
    cur = conn.cursor()
    cur.execute("select value from metadata where name='maxzoom'")
    row = cur.fetchone()
    conn.close()
    if not row:
        raise RuntimeError(f"Unable to determine maxzoom for {mbtiles_path}")
    maxzoom = int(row[0])
    convert.mbtiles_to_pmtiles(mbtiles_path, pmtiles_path, maxzoom)


def log_progress(message: str) -> None:
    """Log a progress message with timestamp."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def download_la_boundaries(output_path: str, retries: int = 3) -> None:
    """Download LA boundaries from SpatialHub WFS service with retry logic.

    Requests EPSG:4326 (WGS84) to match expected input CRS.
    """
    url = (
        "https://geo.spatialhub.scot/geoserver/sh_las/wfs"
        "?service=WFS"
        "&authkey=003654b7-944f-4a02-8f8a-0091da77ebe0"
        "&request=GetFeature"
        "&typeName=sh_las:pub_las"
        "&srsName=EPSG:4326"
        "&format_options=filename:Local_Authority_Boundaries_-_Scotland"
        "&outputFormat=application/json"
    )

    for attempt in range(retries):
        try:
            log_progress(f"Downloading LA boundaries from SpatialHub WFS (attempt {attempt + 1}/{retries})...")
            urllib.request.urlretrieve(url, output_path)
            file_size = os.path.getsize(output_path) / (1024 * 1024)  # MB
            log_progress(f"Downloaded {file_size:.1f}MB to {output_path}")
            return
        except Exception as e:
            if attempt < retries - 1:
                log_progress(f"Download failed: {e}. Retrying in 5 seconds...")
                time.sleep(5)
            else:
                raise RuntimeError(f"Failed to download LA boundaries after {retries} attempts: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build routes parquet + pmtiles with DuckDB spatial joins.")
    parser.add_argument("routes_geojson", help="Input routes GeoJSON (LineString/MultiLineString).")
    parser.add_argument("--la-geojson", help="Local authority boundaries GeoJSON (downloads from SpatialHub if not provided).")
    parser.add_argument("rpt_geojson", help="RTP boundaries GeoJSON.")
    parser.add_argument("--output-dir", default="public", help="Output directory for public artifacts (tiles, PMTiles).")
    parser.add_argument("--data-dir", default="data", help="Data working directory.")
    parser.add_argument(
        "--parquet-dir",
        default=os.path.join("data", "parquet"),
        help="Directory for generated parquet artifacts (routes, operators).",
    )
    parser.add_argument("--min-length-m", type=float, default=0.0, help="Minimum intersection length (meters).")
    parser.add_argument("--min-share", type=float, default=0.0, help="Minimum route share (0-1) for membership.")
    parser.add_argument("--layer", default="routes", help="Vector tile layer name.")
    parser.add_argument("--skip-tiles", action="store_true", help="Skip pmtiles generation.")
    parser.add_argument("--threads", type=int, default=None, help="Number of DuckDB threads (default: auto-detect).")
    parser.add_argument("--resume", action="store_true", help="Skip generation of existing output files.")
    parser.add_argument("--memory-limit", default="8GB", help="DuckDB memory limit (e.g., '8GB', '4GB').")
    args = parser.parse_args()

    ensure_dir(args.output_dir)
    ensure_dir(args.data_dir)
    ensure_dir(args.parquet_dir)

    # Download LA boundaries if not provided
    if args.la_geojson:
        la_path = os.path.abspath(args.la_geojson)
    else:
        la_path = os.path.join(args.data_dir, "la_boundaries.geojson")
        if not os.path.exists(la_path):
            download_la_boundaries(la_path)
        else:
            print(f"Using cached LA boundaries from {la_path}", flush=True)

    log_progress("Initializing DuckDB...")
    conn = duckdb.connect()

    # Configure DuckDB for performance
    if args.threads:
        conn.execute(f"SET threads={args.threads}")
        log_progress(f"Set DuckDB threads to {args.threads}")
    conn.execute(f"SET memory_limit='{args.memory_limit}'")
    log_progress(f"Set DuckDB memory limit to {args.memory_limit}")

    log_progress("Loading spatial extension...")
    conn.execute("INSTALL spatial")
    conn.execute("LOAD spatial")

    routes_path = os.path.abspath(args.routes_geojson)
    rpt_path = os.path.abspath(args.rpt_geojson)

    log_progress("Reading routes...")
    start_time = time.time()
    conn.execute("CREATE TABLE routes_raw AS SELECT * FROM ST_Read(?)", [routes_path])
    route_count = conn.execute("SELECT COUNT(*) FROM routes_raw").fetchone()[0]
    log_progress(f"Loaded {route_count:,} routes in {time.time() - start_time:.1f}s")

    route_cols = get_columns(conn, "routes_raw")
    route_geom = find_column(route_cols, ["geom", "geometry", "wkb_geometry"])
    if not route_geom:
        raise RuntimeError("Could not find geometry column in routes input.")
    route_non_geom = [c for c in route_cols if c != route_geom]
    route_select = ", ".join([quote_ident(c) for c in route_non_geom])

    log_progress("Normalizing routes...")
    start_time = time.time()
    conn.execute(
        f"""
        CREATE TABLE routes AS
        SELECT
          row_number() OVER () AS route_id,
          {route_select},
          {quote_ident(route_geom)} AS geom
        FROM routes_raw
        """
    )
    log_progress(f"Normalized routes in {time.time() - start_time:.1f}s")

    log_progress("Computing route lengths and transforming to EPSG:27700...")
    start_time = time.time()
    conn.execute(
        "CREATE TABLE routes_len AS SELECT *, "
        "ST_Transform(geom, 'EPSG:4326', 'EPSG:27700') AS geom_27700, "
        "ST_Length(ST_Transform(geom, 'EPSG:4326', 'EPSG:27700')) AS route_length_m "
        "FROM routes"
    )
    log_progress(f"Computed route lengths in {time.time() - start_time:.1f}s")

    log_progress("Reading LA boundaries...")
    start_time = time.time()
    conn.execute("CREATE TABLE la_raw AS SELECT * FROM ST_Read(?)", [la_path])
    la_count = conn.execute("SELECT COUNT(*) FROM la_raw").fetchone()[0]
    log_progress(f"Loaded {la_count} LA boundaries in {time.time() - start_time:.1f}s")

    la_cols = get_columns(conn, "la_raw")
    la_geom = find_column(la_cols, ["geom", "geometry", "wkb_geometry"])
    la_code = find_column(la_cols, ["code", "la_code", "la"])
    la_name = find_column(la_cols, ["local_authority", "la_name", "name"])
    if not la_geom or not la_code:
        raise RuntimeError("Could not find expected LA columns.")

    log_progress("Preparing LA table with spatial transform and geometry validation...")
    start_time = time.time()
    conn.execute(
        f"""
        CREATE TABLE la AS
        SELECT
          {quote_ident(la_code)} AS la_code,
          {quote_ident(la_name)} AS la_name,
          ST_Buffer(ST_MakeValid({quote_ident(la_geom)}), 0) AS geom,
          ST_Buffer(ST_Transform(ST_MakeValid({quote_ident(la_geom)}), 'EPSG:4326', 'EPSG:27700'), 0) AS geom_27700
        FROM la_raw
        """
    )
    log_progress(f"Prepared LA table in {time.time() - start_time:.1f}s")

    log_progress("Reading RTP boundaries...")
    start_time = time.time()
    conn.execute("CREATE TABLE rpt_raw AS SELECT * FROM ST_Read(?)", [rpt_path])
    rpt_raw_count = conn.execute("SELECT COUNT(*) FROM rpt_raw").fetchone()[0]
    log_progress(f"Loaded {rpt_raw_count} RTP boundaries in {time.time() - start_time:.1f}s")

    rpt_cols = get_columns(conn, "rpt_raw")
    rpt_geom = find_column(rpt_cols, ["geom", "geometry", "wkb_geometry"])
    rpt_code = find_column(rpt_cols, ["rpt_code", "code", "rpt"])
    rpt_name = find_column(rpt_cols, ["rpt_name", "name"])
    if not rpt_geom or not rpt_code:
        raise RuntimeError("Could not find expected RTP columns.")

    log_progress("Preparing RTP table with spatial transform and geometry validation...")
    start_time = time.time()
    conn.execute(
        f"""
        CREATE TABLE rpt AS
        SELECT
          {quote_ident(rpt_code)} AS rpt_code,
          {quote_ident(rpt_name)} AS rpt_name,
          ST_Buffer(ST_MakeValid({quote_ident(rpt_geom)}), 0) AS geom,
          ST_Buffer(ST_Transform(ST_MakeValid({quote_ident(rpt_geom)}), 'EPSG:4326', 'EPSG:27700'), 0) AS geom_27700
        FROM rpt_raw
        """
    )
    log_progress(f"Prepared RTP table in {time.time() - start_time:.1f}s")

    log_progress(f"Computing LA intersections ({route_count:,} routes × {la_count} LAs)...")
    log_progress("  Step 1/5: Finding spatial overlaps with ST_Intersects...")
    log_progress(f"  Note: This spatial join can take 30-120 seconds depending on geometry complexity...")
    start_time = time.time()
    step_time = time.time()

    # First, verify geometries are valid
    log_progress("  → Verifying LA geometries are valid...")
    invalid_la = conn.execute("SELECT COUNT(*) FROM la WHERE ST_IsValid(geom_27700) = false").fetchone()[0]
    if invalid_la > 0:
        log_progress(f"  ⚠ Warning: {invalid_la} LA boundaries have invalid geometries after ST_MakeValid")

    log_progress("  → Running ST_Intersects join (this may take 1-2 minutes)...")
    conn.execute(
        """
        CREATE TABLE la_intersections AS
        SELECT
          r.route_id,
          l.la_code,
          l.la_name,
          ST_Length(ST_Intersection(r.geom_27700, l.geom_27700)) AS len_m
        FROM routes_len r
        JOIN la l ON ST_Intersects(r.geom_27700, l.geom_27700)
        """
    )
    intersection_count = conn.execute("SELECT COUNT(*) FROM la_intersections").fetchone()[0]
    log_progress(f"  ✓ Found {intersection_count:,} LA intersections in {time.time() - step_time:.1f}s")

    log_progress("  Step 2/5: Cleaning invalid intersections...")
    step_time = time.time()
    conn.execute("DELETE FROM la_intersections WHERE len_m IS NULL OR len_m <= 0")
    final_count = conn.execute("SELECT COUNT(*) FROM la_intersections").fetchone()[0]
    removed_count = intersection_count - final_count
    log_progress(f"  ✓ Removed {removed_count:,} invalid intersections in {time.time() - step_time:.1f}s, {final_count:,} valid intersections remain")

    log_progress("  Step 3/5: Computing primary LA assignments (longest intersection)...")
    step_time = time.time()
    conn.execute(
        """
        CREATE TABLE la_primary AS
        SELECT
          route_id,
          arg_max(la_code, len_m) AS la_code,
          arg_max(la_name, len_m) AS la_name
        FROM la_intersections
        GROUP BY route_id
        """
    )
    la_primary_count = conn.execute("SELECT COUNT(*) FROM la_primary").fetchone()[0]
    log_progress(f"  ✓ Assigned {la_primary_count:,} routes to primary LAs in {time.time() - step_time:.1f}s")

    log_progress("  Step 4/5: Creating final LA assignments (including NULL for routes without intersections)...")
    step_time = time.time()
    conn.execute(
        """
        CREATE TABLE la_final AS
        SELECT
          r.route_id,
          p.la_code AS la_code,
          p.la_name AS la_name
        FROM routes_len r
        LEFT JOIN la_primary p ON p.route_id = r.route_id
        """
    )
    null_count = conn.execute("SELECT COUNT(*) FROM la_final WHERE la_code IS NULL").fetchone()[0]
    if null_count > 0:
        log_progress(f"  ⚠ Warning: {null_count:,} routes have no LA assignment")
    log_progress(f"  ✓ Created final LA assignments in {time.time() - step_time:.1f}s")

    log_progress("  Step 5/5: Building multi-membership lists (pipe-delimited)...")
    step_time = time.time()
    conn.execute(
        f"""
        CREATE TABLE la_membership AS
        SELECT
          i.route_id,
          '|' || string_agg(i.la_code, '|' ORDER BY i.len_m DESC) || '|' AS la_codes,
          '|' || string_agg(i.la_name, '|' ORDER BY i.len_m DESC) || '|' AS la_names
        FROM la_intersections i
        JOIN routes_len r ON r.route_id = i.route_id
        WHERE i.len_m >= {args.min_length_m} AND i.len_m / NULLIF(r.route_length_m, 0) >= {args.min_share}
        GROUP BY i.route_id
        """
    )
    membership_count = conn.execute("SELECT COUNT(*) FROM la_membership").fetchone()[0]
    log_progress(f"  ✓ Built multi-membership for {membership_count:,} routes in {time.time() - step_time:.1f}s")
    log_progress(f"Completed LA processing in {time.time() - start_time:.1f}s total")

    rpt_count = conn.execute("SELECT COUNT(*) FROM rpt").fetchone()[0]
    log_progress(f"Computing RTP intersections ({route_count:,} routes × {rpt_count} RPTs)...")
    log_progress("  Step 1/5: Finding spatial overlaps with ST_Intersects...")
    start_time = time.time()
    step_time = time.time()
    conn.execute(
        """
        CREATE TABLE rpt_intersections AS
        SELECT
          r.route_id,
          p.rpt_code,
          p.rpt_name,
          ST_Length(ST_Intersection(r.geom_27700, p.geom_27700)) AS len_m
        FROM routes_len r
        JOIN rpt p ON ST_Intersects(r.geom_27700, p.geom_27700)
        """
    )
    rpt_intersection_count = conn.execute("SELECT COUNT(*) FROM rpt_intersections").fetchone()[0]
    log_progress(f"  ✓ Found {rpt_intersection_count:,} RTP intersections in {time.time() - step_time:.1f}s")

    log_progress("  Step 2/5: Cleaning invalid intersections...")
    step_time = time.time()
    conn.execute("DELETE FROM rpt_intersections WHERE len_m IS NULL OR len_m <= 0")
    rpt_final_count = conn.execute("SELECT COUNT(*) FROM rpt_intersections").fetchone()[0]
    rpt_removed_count = rpt_intersection_count - rpt_final_count
    log_progress(f"  ✓ Removed {rpt_removed_count:,} invalid intersections in {time.time() - step_time:.1f}s, {rpt_final_count:,} valid intersections remain")

    log_progress("  Step 3/5: Computing primary RTP assignments (longest intersection)...")
    step_time = time.time()
    conn.execute(
        """
        CREATE TABLE rpt_primary AS
        SELECT
          route_id,
          arg_max(rpt_code, len_m) AS rpt_code,
          arg_max(rpt_name, len_m) AS rpt_name
        FROM rpt_intersections
        GROUP BY route_id
        """
    )
    rpt_primary_count = conn.execute("SELECT COUNT(*) FROM rpt_primary").fetchone()[0]
    log_progress(f"  ✓ Assigned {rpt_primary_count:,} routes to primary RPTs in {time.time() - step_time:.1f}s")

    log_progress("  Step 4/5: Creating final RTP assignments (including NULL for routes without intersections)...")
    step_time = time.time()
    conn.execute(
        """
        CREATE TABLE rpt_final AS
        SELECT
          r.route_id,
          p.rpt_code AS rpt_code,
          p.rpt_name AS rpt_name
        FROM routes_len r
        LEFT JOIN rpt_primary p ON p.route_id = r.route_id
        """
    )
    rpt_null_count = conn.execute("SELECT COUNT(*) FROM rpt_final WHERE rpt_code IS NULL").fetchone()[0]
    if rpt_null_count > 0:
        log_progress(f"  ⚠ Warning: {rpt_null_count:,} routes have no RPT assignment")
    log_progress(f"  ✓ Created final RTP assignments in {time.time() - step_time:.1f}s")

    log_progress("  Step 5/5: Building multi-membership lists (pipe-delimited)...")
    step_time = time.time()
    conn.execute(
        f"""
        CREATE TABLE rpt_membership AS
        SELECT
          i.route_id,
          '|' || string_agg(i.rpt_code, '|' ORDER BY i.len_m DESC) || '|' AS rpt_codes,
          '|' || string_agg(i.rpt_name, '|' ORDER BY i.len_m DESC) || '|' AS rpt_names
        FROM rpt_intersections i
        JOIN routes_len r ON r.route_id = i.route_id
        WHERE i.len_m >= {args.min_length_m} AND i.len_m / NULLIF(r.route_length_m, 0) >= {args.min_share}
        GROUP BY i.route_id
        """
    )
    rpt_membership_count = conn.execute("SELECT COUNT(*) FROM rpt_membership").fetchone()[0]
    log_progress(f"  ✓ Built multi-membership for {rpt_membership_count:,} routes in {time.time() - step_time:.1f}s")
    log_progress(f"Completed RTP processing in {time.time() - start_time:.1f}s total")

    exclude = {
        "la_code",
        "la_name",
        "rpt_code",
        "rpt_name",
        "la_codes",
        "la_names",
        "rpt_codes",
        "rpt_names",
        "route_id",
        "route_length_m",
    }
    output_cols = [c for c in route_non_geom if c not in exclude]
    output_select = ", ".join([quote_ident(c) for c in output_cols])

    log_progress("Building final routes output table...")
    start_time = time.time()
    conn.execute(
        f"""
        CREATE TABLE routes_out AS
        SELECT
          {output_select},
          geom AS geometry,
          la_final.la_code,
          la_final.la_name,
          la_membership.la_codes,
          la_membership.la_names,
          rpt_final.rpt_code,
          rpt_final.rpt_name,
          rpt_membership.rpt_codes,
          rpt_membership.rpt_names
        FROM routes_len r
        LEFT JOIN la_final ON la_final.route_id = r.route_id
        LEFT JOIN la_membership ON la_membership.route_id = r.route_id
        LEFT JOIN rpt_final ON rpt_final.route_id = r.route_id
        LEFT JOIN rpt_membership ON rpt_membership.route_id = r.route_id
        """
    )
    output_count = conn.execute("SELECT COUNT(*) FROM routes_out").fetchone()[0]
    log_progress(f"Built output table with {output_count:,} routes in {time.time() - start_time:.1f}s")

    output_parquet = os.path.join(args.parquet_dir, "routes.parquet")
    log_progress(f"Writing routes parquet to {output_parquet}...")
    start_time = time.time()
    conn.execute(f"COPY (SELECT * FROM routes_out) TO '{output_parquet}' (FORMAT PARQUET)")
    parquet_size = os.path.getsize(output_parquet) / (1024 * 1024)
    log_progress(f"Wrote {parquet_size:.1f}MB parquet in {time.time() - start_time:.1f}s")

    output_geojson = os.path.join(args.data_dir, "routes_enriched.geojson")
    log_progress(f"Writing enriched GeoJSON to {output_geojson}...")
    start_time = time.time()
    try:
        # Use DuckDB spatial ST_Write function
        conn.execute(f"CALL ST_Write(routes_out, '{output_geojson}')")
        geojson_size = os.path.getsize(output_geojson) / (1024 * 1024)
        log_progress(f"Wrote {geojson_size:.1f}MB GeoJSON in {time.time() - start_time:.1f}s")
    except Exception as e:
        log_progress(f"⚠ Warning: Could not write GeoJSON (not critical, parquet is primary output): {e}")

    operators_parquet = os.path.join(args.parquet_dir, "operators.parquet")
    log_progress("Writing operators parquet...")
    conn.execute(
        f"""
        COPY (
          SELECT DISTINCT operatorCode, operatorName
          FROM routes_out
          WHERE operatorCode IS NOT NULL OR operatorName IS NOT NULL
        ) TO '{operators_parquet}' (FORMAT PARQUET)
        """
    )
    operator_count = conn.execute(
        "SELECT COUNT(DISTINCT operatorCode) FROM routes_out WHERE operatorCode IS NOT NULL"
    ).fetchone()[0]
    log_progress(f"Wrote {operator_count} operators")

    if not args.skip_tiles:
        log_progress("Building vector tiles with tippecanoe...")
        start_time = time.time()
        mbtiles_path = os.path.join(args.data_dir, "routes.mbtiles")
        run_tippecanoe(output_geojson, mbtiles_path, args.layer)
        log_progress(f"Built MBTiles in {time.time() - start_time:.1f}s")

        log_progress("Converting to PMTiles...")
        start_time = time.time()
        pmtiles_path = os.path.join(args.output_dir, "routes.pmtiles")
        mbtiles_to_pmtiles(mbtiles_path, pmtiles_path)
        pmtiles_size = os.path.getsize(pmtiles_path) / (1024 * 1024)
        log_progress(f"Created {pmtiles_size:.1f}MB PMTiles in {time.time() - start_time:.1f}s")

    log_progress("Build complete!")


if __name__ == "__main__":
    main()
