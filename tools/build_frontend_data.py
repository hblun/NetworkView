#!/usr/bin/env python3
"""
Build frontend artifacts using DuckDB spatial joins.

This script enriches routes with LA/RTP primary fields and multi-membership
fields so filters can match "route goes through area".
"""

import argparse
import os
import subprocess
from typing import List, Optional

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


def main() -> None:
    parser = argparse.ArgumentParser(description="Build routes parquet + pmtiles with DuckDB spatial joins.")
    parser.add_argument("routes_geojson", help="Input routes GeoJSON (LineString/MultiLineString).")
    parser.add_argument("la_geojson", help="Local authority boundaries GeoJSON.")
    parser.add_argument("rpt_geojson", help="RTP boundaries GeoJSON.")
    parser.add_argument("--output-dir", default="public", help="Output directory for public artifacts.")
    parser.add_argument("--data-dir", default="data", help="Data working directory.")
    parser.add_argument("--min-length-m", type=float, default=0.0, help="Minimum intersection length (meters).")
    parser.add_argument("--min-share", type=float, default=0.0, help="Minimum route share (0-1) for membership.")
    parser.add_argument("--layer", default="routes", help="Vector tile layer name.")
    parser.add_argument("--skip-tiles", action="store_true", help="Skip pmtiles generation.")
    args = parser.parse_args()

    ensure_dir(args.output_dir)
    ensure_dir(args.data_dir)

    print("Initializing DuckDB…", flush=True)
    conn = duckdb.connect()
    try:
        conn.execute("SET threads=4")
    except Exception:
        pass
    print("Loading spatial extension…", flush=True)
    conn.execute("INSTALL spatial")
    conn.execute("LOAD spatial")

    routes_path = os.path.abspath(args.routes_geojson)
    la_path = os.path.abspath(args.la_geojson)
    rpt_path = os.path.abspath(args.rpt_geojson)

    print("Reading routes…", flush=True)
    conn.execute("CREATE TABLE routes_raw AS SELECT * FROM ST_Read(?)", [routes_path])
    route_cols = get_columns(conn, "routes_raw")
    route_geom = find_column(route_cols, ["geom", "geometry", "wkb_geometry"])
    if not route_geom:
        raise RuntimeError("Could not find geometry column in routes input.")
    route_non_geom = [c for c in route_cols if c != route_geom]
    route_select = ", ".join([quote_ident(c) for c in route_non_geom])
    print("Normalizing routes…", flush=True)
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

    print("Computing route lengths…", flush=True)
    conn.execute(
        "CREATE TABLE routes_len AS SELECT *, "
        "ST_Transform(geom, 'EPSG:4326', 'EPSG:27700') AS geom_27700, "
        "ST_Length(ST_Transform(geom, 'EPSG:4326', 'EPSG:27700')) AS route_length_m "
        "FROM routes"
    )

    print("Reading LA boundaries…", flush=True)
    conn.execute("CREATE TABLE la_raw AS SELECT * FROM ST_Read(?)", [la_path])
    la_cols = get_columns(conn, "la_raw")
    la_geom = find_column(la_cols, ["geom", "geometry", "wkb_geometry"])
    la_code = find_column(la_cols, ["code", "la_code", "la"])
    la_name = find_column(la_cols, ["local_authority", "la_name", "name"])
    if not la_geom or not la_code:
        raise RuntimeError("Could not find expected LA columns.")
    print("Preparing LA table…", flush=True)
    conn.execute(
        f"""
        CREATE TABLE la AS
        SELECT
          {quote_ident(la_code)} AS la_code,
          {quote_ident(la_name)} AS la_name,
          {quote_ident(la_geom)} AS geom,
          ST_Transform({quote_ident(la_geom)}, 'EPSG:4326', 'EPSG:27700') AS geom_27700
        FROM la_raw
        """
    )

    print("Reading RTP boundaries…", flush=True)
    conn.execute("CREATE TABLE rpt_raw AS SELECT * FROM ST_Read(?)", [rpt_path])
    rpt_cols = get_columns(conn, "rpt_raw")
    rpt_geom = find_column(rpt_cols, ["geom", "geometry", "wkb_geometry"])
    rpt_code = find_column(rpt_cols, ["rpt_code", "code", "rpt"])
    rpt_name = find_column(rpt_cols, ["rpt_name", "name"])
    if not rpt_geom or not rpt_code:
        raise RuntimeError("Could not find expected RTP columns.")
    print("Preparing RTP table…", flush=True)
    conn.execute(
        f"""
        CREATE TABLE rpt AS
        SELECT
          {quote_ident(rpt_code)} AS rpt_code,
          {quote_ident(rpt_name)} AS rpt_name,
          {quote_ident(rpt_geom)} AS geom,
          ST_Transform({quote_ident(rpt_geom)}, 'EPSG:4326', 'EPSG:27700') AS geom_27700
        FROM rpt_raw
        """
    )

    print("Computing LA intersections…", flush=True)
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
    conn.execute("DELETE FROM la_intersections WHERE len_m IS NULL OR len_m <= 0")

    print("Computing LA primary + membership…", flush=True)
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

    conn.execute(
        """
        CREATE TABLE la_primary_fallback AS
        SELECT
          r.route_id,
          l.la_code,
          l.la_name
        FROM routes_len r
        LEFT JOIN la_primary p ON p.route_id = r.route_id
        WHERE p.la_code IS NULL
        CROSS JOIN LATERAL (
          SELECT la_code, la_name
          FROM la
          ORDER BY ST_Distance(r.geom_27700, geom_27700)
          LIMIT 1
        ) l
        """
    )

    conn.execute(
        """
        CREATE TABLE la_final AS
        SELECT
          r.route_id,
          COALESCE(p.la_code, f.la_code) AS la_code,
          COALESCE(p.la_name, f.la_name) AS la_name
        FROM routes_len r
        LEFT JOIN la_primary p ON p.route_id = r.route_id
        LEFT JOIN la_primary_fallback f ON f.route_id = r.route_id
        """
    )

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

    print("Computing RTP intersections…", flush=True)
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
    conn.execute("DELETE FROM rpt_intersections WHERE len_m IS NULL OR len_m <= 0")

    print("Computing RTP primary + membership…", flush=True)
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

    conn.execute(
        """
        CREATE TABLE rpt_primary_fallback AS
        SELECT
          r.route_id,
          p.rpt_code,
          p.rpt_name
        FROM routes_len r
        LEFT JOIN rpt_primary p0 ON p0.route_id = r.route_id
        WHERE p0.rpt_code IS NULL
        CROSS JOIN LATERAL (
          SELECT rpt_code, rpt_name
          FROM rpt
          ORDER BY ST_Distance(r.geom_27700, geom_27700)
          LIMIT 1
        ) p
        """
    )

    conn.execute(
        """
        CREATE TABLE rpt_final AS
        SELECT
          r.route_id,
          COALESCE(p.rpt_code, f.rpt_code) AS rpt_code,
          COALESCE(p.rpt_name, f.rpt_name) AS rpt_name
        FROM routes_len r
        LEFT JOIN rpt_primary p ON p.route_id = r.route_id
        LEFT JOIN rpt_primary_fallback f ON f.route_id = r.route_id
        """
    )

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

    print("Writing routes output…", flush=True)
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

    output_parquet = os.path.join(args.output_dir, "routes.parquet")
    conn.execute(f"COPY (SELECT * FROM routes_out) TO '{output_parquet}' (FORMAT PARQUET)")

    output_geojson = os.path.join(args.data_dir, "routes_enriched.geojson")
    print("Writing enriched GeoJSON…", flush=True)
    conn.execute(
        f"COPY (SELECT * EXCLUDE (geometry) , geometry FROM routes_out) TO '{output_geojson}' (FORMAT GDAL, DRIVER 'GeoJSON')"
    )

    operators_parquet = os.path.join(args.output_dir, "operators.parquet")
    print("Writing operators parquet…", flush=True)
    conn.execute(
        f"""
        COPY (
          SELECT DISTINCT operatorCode, operatorName
          FROM routes_out
          WHERE operatorCode IS NOT NULL OR operatorName IS NOT NULL
        ) TO '{operators_parquet}' (FORMAT PARQUET)
        """
    )

    if not args.skip_tiles:
        print("Building tiles…", flush=True)
        mbtiles_path = os.path.join(args.data_dir, "routes.mbtiles")
        run_tippecanoe(output_geojson, mbtiles_path, args.layer)
        pmtiles_path = os.path.join(args.output_dir, "routes.pmtiles")
        mbtiles_to_pmtiles(mbtiles_path, pmtiles_path)

    print("Build complete.", flush=True)


if __name__ == "__main__":
    main()
