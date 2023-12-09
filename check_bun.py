"""
Fetches the latest Bun version based on the version type specified as a command-line argument.
"""

import argparse
import requests
from bs4 import BeautifulSoup
from packaging import version


def get_bun_latest_versions(version_type):
    """
    Fetches the latest Bun version based on the version type from the Bun NPM page.

    Args:
      version_type (str): The type of version to fetch.
      Possible values are "latest", "canary", or "both".

    Returns:
      str or dict: The latest Bun version(s) based on the version type.
      If version_type is "latest", returns a string.
      If version_type is "canary", returns a string. If version_type is "both",
      returns a dictionary with keys "latest"
      and "canary" and their corresponding values as strings.
    """
    url = "https://www.npmjs.com/package/bun?activeTab=versions"
    response = requests.get(url, timeout=5)
    soup = BeautifulSoup(response.content, "html.parser")

    # Find all version elements on the page
    versions = soup.find_all("a", class_="_132722c7 f5 black-60 lh-copy code")
    version_list = [version.get_text().strip() for version in versions]

    # Get the latest versions
    latest_latest = None
    latest_canary = None

    for version_str in version_list:
        # Split the version string at the first hyphen
        version_parts = version_str.split("-", 1)
        parsed_version = version.parse(version_parts[0])

        if "canary" in version_str:
            if latest_canary is None or parsed_version > version.parse(
                latest_canary.split("-", 1)[0]
            ):
                latest_canary = version_str
        else:
            if latest_latest is None or parsed_version > version.parse(
                latest_latest.split("-", 1)[0]
            ):
                latest_latest = version_str

    # Filter based on version type
    if version_type == "latest":
        return latest_latest
    if version_type == "canary":
        return latest_canary
    if version_type == "both":
        return {"latest": latest_latest, "canary": latest_canary}


def main():
    """
    Fetches the latest Bun version based on the version type specified as a command-line argument.

    Command-line Arguments:
      --version-type (str): The type of version to fetch.
      Possible values are "latest", "canary", or "both".
                  Defaults to "both".

    Prints:
      The latest Bun version(s) based on the version type.
    """
    parser = argparse.ArgumentParser(
        description="Fetch the latest Bun version based on version type."
    )
    parser.add_argument(
        "--version-type",
        type=str,
        choices=["latest", "canary", "both"],
        default="both",
        help="Version type to fetch: latest, canary, or both",
    )

    args = parser.parse_args()

    # Get the latest Bun version(s)
    latest_versions = get_bun_latest_versions(args.version_type)
    print(latest_versions)


if __name__ == "__main__":
    main()
