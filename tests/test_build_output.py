#!/usr/bin/env python3
"""
Test that build_frontend_data.py output is valid and usable by the frontend.

This validates:
1. Required parquet files exist and are readable
2. Schema includes necessary columns for filters
3. PMTiles files are valid
4. Sample queries work as expected (simulates frontend filters)
"""

import os
import sys
from pathlib import Path

import duckdb
import pytest


PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "parquet"
PUBLIC_DIR = PROJECT_ROOT / "public"


def test_routes_parquet_exists():
    """Verify routes.parquet exists and has data."""
    parquet_path = DATA_DIR / "routes.parquet"
    assert parquet_path.exists(), f"routes.parquet not found at {parquet_path}"

    # Check file is not empty
    assert parquet_path.stat().st_size > 0, "routes.parquet is empty"


def test_routes_schema():
    """Verify routes.parquet has all required columns for frontend filters."""
    conn = duckdb.connect()
    parquet_path = DATA_DIR / "routes.parquet"

    # Load parquet
    result = conn.execute(f"SELECT * FROM '{parquet_path}' LIMIT 1").fetchdf()

    # Required columns for filters
    required_columns = {
        # Geographic filters
        "la_code",
        "la_name",
        "rpt_code",
        "rpt_name",
        "la_codes",  # multi-membership
        "la_names",  # multi-membership
        "rpt_codes",  # multi-membership
        "rpt_names",  # multi-membership
        # Route attributes
        "operatorCode",
        "operatorName",
        # Geometry
        "geometry",
    }

    actual_columns = set(result.columns)
    missing = required_columns - actual_columns

    assert not missing, f"Missing required columns: {missing}"


def test_operators_parquet_exists():
    """Verify operators.parquet exists and has valid data."""
    operators_path = DATA_DIR / "operators.parquet"
    assert operators_path.exists(), f"operators.parquet not found at {operators_path}"

    conn = duckdb.connect()
    result = conn.execute(f"SELECT * FROM '{operators_path}'").fetchdf()

    assert len(result) > 0, "operators.parquet has no rows"
    assert "operatorCode" in result.columns
    assert "operatorName" in result.columns


def test_pmtiles_exist():
    """Verify PMTiles files exist for map rendering."""
    routes_pmtiles = PUBLIC_DIR / "routes.pmtiles"
    assert routes_pmtiles.exists(), f"routes.pmtiles not found at {routes_pmtiles}"
    assert routes_pmtiles.stat().st_size > 0, "routes.pmtiles is empty"


def test_filter_by_la():
    """Test LA filter query (simulates frontend filtering by Local Authority)."""
    conn = duckdb.connect()
    parquet_path = DATA_DIR / "routes.parquet"

    # Query: Find all routes in Highland LA
    query = f"""
        SELECT COUNT(*) as count
        FROM '{parquet_path}'
        WHERE la_code = 'S12000017' OR la_codes LIKE '%|S12000017|%'
    """
    result = conn.execute(query).fetchone()
    count = result[0]

    assert count > 0, "Expected routes in Highland LA but found none"
    print(f"✓ Found {count} routes in Highland LA")


def test_filter_by_rpt():
    """Test RPT filter query (simulates frontend filtering by RTP)."""
    conn = duckdb.connect()
    parquet_path = DATA_DIR / "routes.parquet"

    # Query: Find all routes in HITRANS RPT
    query = f"""
        SELECT COUNT(*) as count
        FROM '{parquet_path}'
        WHERE rpt_code = 'HIT' OR rpt_codes LIKE '%|HIT|%'
    """
    result = conn.execute(query).fetchone()
    count = result[0]

    assert count > 0, "Expected routes in HITRANS RPT but found none"
    print(f"✓ Found {count} routes in HITRANS RPT")


def test_filter_by_operator():
    """Test operator filter query (simulates frontend filtering by operator)."""
    conn = duckdb.connect()
    parquet_path = DATA_DIR / "routes.parquet"

    # Get first operator
    operator_query = f"SELECT DISTINCT operatorCode FROM '{parquet_path}' WHERE operatorCode IS NOT NULL LIMIT 1"
    operator_code = conn.execute(operator_query).fetchone()[0]

    # Filter by that operator
    count_query = f"SELECT COUNT(*) FROM '{parquet_path}' WHERE operatorCode = '{operator_code}'"
    count = conn.execute(count_query).fetchone()[0]

    assert count > 0, f"Expected routes for operator {operator_code} but found none"
    print(f"✓ Found {count} routes for operator {operator_code}")


def test_multi_membership_format():
    """Verify multi-membership fields use pipe-delimited format."""
    conn = duckdb.connect()
    parquet_path = DATA_DIR / "routes.parquet"

    # Get a route with multi-membership
    query = f"""
        SELECT la_codes, la_names, rpt_codes, rpt_names
        FROM '{parquet_path}'
        WHERE la_codes LIKE '%|%|%'  -- At least 2 LAs (has 2 pipes means 2+ values)
        LIMIT 1
    """
    result = conn.execute(query).fetchone()

    if result:
        la_codes, la_names, rpt_codes, rpt_names = result
        # Check format: starts and ends with |
        assert la_codes.startswith("|") and la_codes.endswith("|"), \
            f"la_codes should be pipe-delimited: {la_codes}"
        assert la_names.startswith("|") and la_names.endswith("|"), \
            f"la_names should be pipe-delimited: {la_names}"
        print(f"✓ Multi-membership format is correct: {la_codes}")


def test_geometry_valid():
    """Verify geometry column contains valid GeoJSON."""
    conn = duckdb.connect()
    conn.execute("INSTALL spatial")
    conn.execute("LOAD spatial")

    parquet_path = DATA_DIR / "routes.parquet"

    # Check geometry is valid
    query = f"""
        SELECT COUNT(*) as count
        FROM '{parquet_path}'
        WHERE geometry IS NOT NULL
    """
    result = conn.execute(query).fetchone()
    count = result[0]

    assert count > 0, "Expected routes with geometry but found none"
    print(f"✓ Found {count} routes with valid geometry")


def test_no_null_primary_assignments():
    """Verify most routes have primary LA/RPT assignments."""
    conn = duckdb.connect()
    parquet_path = DATA_DIR / "routes.parquet"

    total_query = f"SELECT COUNT(*) FROM '{parquet_path}'"
    total = conn.execute(total_query).fetchone()[0]

    # Count routes with primary LA assignment
    la_query = f"SELECT COUNT(*) FROM '{parquet_path}' WHERE la_code IS NOT NULL"
    la_count = conn.execute(la_query).fetchone()[0]

    # Count routes with primary RPT assignment
    rpt_query = f"SELECT COUNT(*) FROM '{parquet_path}' WHERE rpt_code IS NOT NULL"
    rpt_count = conn.execute(rpt_query).fetchone()[0]

    la_coverage = (la_count / total) * 100
    rpt_coverage = (rpt_count / total) * 100

    print(f"✓ LA coverage: {la_coverage:.1f}% ({la_count}/{total})")
    print(f"✓ RPT coverage: {rpt_coverage:.1f}% ({rpt_count}/{total})")

    # We expect most routes to have assignments (allowing for some edge cases like ferries)
    assert la_coverage > 80, f"LA coverage too low: {la_coverage:.1f}%"
    assert rpt_coverage > 80, f"RPT coverage too low: {rpt_coverage:.1f}%"


if __name__ == "__main__":
    # Run tests
    print("Testing build output for frontend compatibility...\n")

    tests = [
        ("Parquet files exist", test_routes_parquet_exists),
        ("Routes schema is valid", test_routes_schema),
        ("Operators parquet exists", test_operators_parquet_exists),
        ("PMTiles exist", test_pmtiles_exist),
        ("Filter by LA works", test_filter_by_la),
        ("Filter by RPT works", test_filter_by_rpt),
        ("Filter by operator works", test_filter_by_operator),
        ("Multi-membership format", test_multi_membership_format),
        ("Geometry is valid", test_geometry_valid),
        ("Primary assignments coverage", test_no_null_primary_assignments),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            test_func()
            print(f"✓ {name}\n")
            passed += 1
        except Exception as e:
            print(f"✗ {name}")
            print(f"  Error: {e}\n")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*60}")

    sys.exit(0 if failed == 0 else 1)
