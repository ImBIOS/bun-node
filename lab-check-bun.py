import requests
from bs4 import BeautifulSoup
import argparse

def get_bun_latest_versions(version_type):
    """
    Fetches the latest Bun version based on the version type from the Bun NPM page.
    """
    url = 'https://www.npmjs.com/package/bun?activeTab=versions'
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Find all version elements on the page
    versions = soup.find_all('a', class_='_132722c7 f5 black-60 lh-copy code')
    version_list = [version.get_text().strip() for version in versions]

    # Get the latest versions
    latest_latest = None
    latest_canary = None
    for version in version_list:
        if 'canary' in version and (latest_canary is None or version > latest_canary):
            latest_canary = version
        elif 'canary' not in version and (latest_latest is None or version > latest_latest):
            latest_latest = version

    # Filter based on version type
    if version_type == 'latest':
        return latest_latest
    elif version_type == 'canary':
        return latest_canary
    elif version_type == 'both':
        return {'latest': latest_latest, 'canary': latest_canary}

def main():
    parser = argparse.ArgumentParser(description='Fetch the latest Bun version based on version type.')
    parser.add_argument('--version-type', type=str, choices=['latest', 'canary', 'both'], default='both',
                        help='Version type to fetch: latest, canary, or both')

    args = parser.parse_args()

    # Get the latest Bun version(s)
    latest_versions = get_bun_latest_versions(args.version_type)
    print(latest_versions)

if __name__ == "__main__":
    main()
