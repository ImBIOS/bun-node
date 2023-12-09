"""
Fetches Node.js versions for specified major versions from the Node.js previous releases page.
"""

import argparse
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
      major_versions (list): A list of major versions to filter for.
    """
    parser = argparse.ArgumentParser(
        description="Fetch Node.js versions for specific major versions."
    )
    parser.add_argument(
        "major_versions",
        nargs="+",
        type=int,
        help="List of major versions to fetch, separated by spaces",
    )

    args = parser.parse_args()

    # Get Node.js versions
    nodejs_versions = get_nodejs_versions(args.major_versions)
    print(nodejs_versions)


if __name__ == "__main__":
    main()
