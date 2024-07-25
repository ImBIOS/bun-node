"""
Fetches Node.js versions for specified major versions from the Node.js previous releases page.
"""

import argparse
import json
import sys
import requests
from bs4 import BeautifulSoup


def get_nodejs_versions(major_versions):
    """
    Fetches Node.js versions for specified major versions from the Node.js previous releases page.

    Args:
      major_versions (list): A list of major versions to filter for.

    Returns:
      list: A list of Node.js versions that match the specified major versions.
    """
    url = "https://nodejs.org/en/about/previous-releases/"
    response = requests.get(url, timeout=5)
    soup = BeautifulSoup(response.content, "html.parser")

    # Find all version numbers on the page
    versions = soup.find_all("td", attrs={"data-label": "Version"})
    version_list = [
        version.get_text().strip().replace("Node.js ", "") for version in versions
    ]

    # Filter for specific major versions
    filtered_versions = [
        version
        for version in version_list
        if any(version.startswith("v" + str(major) + ".") for major in major_versions)
    ]

    return filtered_versions


def main():
    """
    Fetches Node.js versions for specified major versions from the Node.js previous releases page.

    Command-line Arguments:
      major_versions (str): A string of major versions separated by commas.
    """
    parser = argparse.ArgumentParser(
        description="Fetch Node.js versions for specific major versions."
    )
    parser.add_argument(
        "major_versions",
        type=str,
        help="Comma-separated list of major versions to fetch",
    )

    args = parser.parse_args()

    # Convert comma-separated string to list of integers
    major_versions = [int(major) for major in args.major_versions.split(",")]

    # Get Node.js versions
    nodejs_versions = get_nodejs_versions(major_versions)

    # Read current versions from versions.json
    with open("versions.json", encoding="utf-8") as f:
        current_versions = json.load(f)["nodejs"]

    # Check for updates and set NODE_VERSIONS_TO_BUILD
    updated_versions = []
    for version in nodejs_versions:
        major = version[1:].split(".")[0]
        if major in current_versions:
            if version != current_versions[major]["version"]:
                updated_versions.append(version)
        else:
            # Log a error if the major version is not found
            print(
                f"Error: Major version {major} not found in current versions.",
                file=sys.stderr,
            )

    if updated_versions:
        print(",".join(version[1:] for version in updated_versions))


if __name__ == "__main__":
    main()
