"""
Fetches the latest Bun version based on the version type specified as a command-line argument.
"""

import argparse
import json
import os
import requests
from bs4 import BeautifulSoup
from packaging import version


def get_bun_latest_versions(version_types):
    """
    Fetches the latest Bun version(s) based on the version types from the Bun NPM page.

    Args:
      version_types (list): The types of versions to fetch.

    Returns:
      dict: A dictionary with keys as version types and their
      corresponding latest versions as values.
    """
    url = "https://www.npmjs.com/package/bun?activeTab=versions"
    response = requests.get(url, timeout=5)
    soup = BeautifulSoup(response.content, "html.parser")

    # Find all version elements on the page
    versions = soup.find_all("a", class_="_132722c7 f5 black-60 lh-copy code")
    version_list = [version.get_text().strip() for version in versions]

    # Get the latest versions
    latest_versions = {"latest": None, "canary": None}

    for version_str in version_list:
        # Split the version string at the first hyphen
        version_parts = version_str.split("-", 1)
        parsed_version = version.parse(version_parts[0])

        if "canary" in version_str and "canary" in version_types:
            if latest_versions["canary"] is None or parsed_version > version.parse(
                latest_versions["canary"].split("-", 1)[0]
            ):
                latest_versions["canary"] = version_str
        elif "canary" not in version_str and "latest" in version_types:
            if latest_versions["latest"] is None or parsed_version > version.parse(
                latest_versions["latest"].split("-", 1)[0]
            ):
                latest_versions["latest"] = version_str

    # Return filtered results
    return {k: v for k, v in latest_versions.items() if k in version_types}


def main():
    """
    Fetches the latest Bun version(s) based on the version
    types specified as a command-line argument.

    Command-line Arguments:
      version_type (str): Comma-separated list of version types to fetch.
      Possible values are "latest", "canary".
    """
    parser = argparse.ArgumentParser(
        description="Fetch the latest Bun version(s) based on version types."
    )
    parser.add_argument(
        "version_type",
        type=str,
        default="latest,canary",
        help="Comma-separated list of version types to fetch: latest, canary",
    )

    args = parser.parse_args()

    # Convert comma-separated string to list
    version_types = args.version_type.split(",")

    # Get the latest Bun version(s)
    latest_versions = get_bun_latest_versions(version_types)

    # Read current versions from versions.json
    with open("versions.json", encoding="utf-8") as f:
        current_versions = json.load(f)["bun"]

    # Check for updates and set BUN_VERSIONS_TO_BUILD
    updated_versions = []
    for vt in version_types:
        if latest_versions[vt] != current_versions[vt]:
            updated_versions.append(latest_versions[vt])

    if updated_versions:
        print(",".join(updated_versions))


if __name__ == "__main__":
    main()
