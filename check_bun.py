"""
Script to fetch the latest versions of the Bun package based on specified version types.

Usage:
    python check_bun.py [version_type]

Arguments:
    version_type: Comma-separated list of version types to fetch. Valid options: "latest", "canary".
"""

import argparse
import json
import requests
from bs4 import BeautifulSoup
from packaging import version
from typing import List, Dict, Optional


def get_bun_latest_versions(version_types: List[str]) -> Dict[str, Optional[str]]:
    """
    Fetches the latest Bun versions from the Bun NPM page based on specified version types.

    Args:
        version_types (List[str]): List of version types to fetch.

    Returns:
        Dict[str, Optional[str]]: Dictionary with version types as keys and latest version strings as values.
    """
    url = "https://www.npmjs.com/package/bun?activeTab=versions"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError("Failed to fetch Bun versions") from e

    soup = BeautifulSoup(response.content, "html.parser")
    versions = soup.find_all("a", class_="_132722c7 f5 black-60 lh-copy code")
    version_list = [ver.get_text().strip() for ver in versions]

    latest_versions = {"latest": None, "canary": None}

    for ver_str in version_list:
        parsed_version, is_canary = parse_version(ver_str)
        update_latest_versions(latest_versions, ver_str, parsed_version, is_canary, version_types)

    return {k: v for k, v in latest_versions.items() if k in version_types}


def parse_version(version_str: str) -> (version.Version, bool):
    """
    Parses a version string and identifies if it's a canary version.

    Args:
        version_str (str): The version string to parse.

    Returns:
        version.Version: The parsed version.
        bool: True if it's a canary version, False otherwise.
    """
    version_parts = version_str.split("-", 1)
    parsed_version = version.parse(version_parts[0])
    is_canary = "canary" in version_str
    return parsed_version, is_canary


def update_latest_versions(latest_versions: Dict[str, Optional[str]], version_str: str,
                           parsed_version: version.Version, is_canary: bool, version_types: List[str]):
    """
    Updates the dictionary of latest versions if a newer version is found.

    Args:
        latest_versions (Dict[str, Optional[str]]): Dictionary to store latest versions.
        version_str (str): The version string.
        parsed_version (version.Version): Parsed version object.
        is_canary (bool): Flag indicating if the version is a canary version.
        version_types (List[str]): List of version types to consider.
    """
    type_key = "canary" if is_canary else "latest"
    if type_key in version_types:
        current_version = latest_versions[type_key]
        if current_version is None or parsed_version > version.parse(current_version.split("-", 1)[0]):
            latest_versions[type_key] = version_str


def main():
    parser = argparse.ArgumentParser(description="Fetch the latest Bun versions.")
    parser.add_argument(
        "version_type", type=str, default="latest,canary",
        help="Comma-separated list of version types to fetch: latest, canary"
    )
    args = parser.parse_args()
    version_types = args.version_type.split(",")

    try:
        latest_versions = get_bun_latest_versions(version_types)
    except RuntimeError as e:
        print(str(e))
        return

    with open("versions.json", encoding="utf-8") as f:
        current_versions = json.load(f)["bun"]

    updated_versions = [
        latest_versions[vt] for vt in version_types
        if latest_versions[vt] != current_versions.get(vt)
    ]

    if updated_versions:
        print(",".join(updated_versions))


if __name__ == "__main__":
    main()
