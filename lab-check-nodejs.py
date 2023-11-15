import requests
from bs4 import BeautifulSoup
import argparse

def get_nodejs_versions(major_versions):
    """
    Fetches Node.js versions for specified major versions from the Node.js previous releases page.
    """
    url = 'https://nodejs.org/en/about/previous-releases/'
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Find all version numbers on the page
    versions = soup.find_all('td', attrs={'data-label': 'Version'})
    version_list = [version.get_text().strip().replace('Node.js ', '') for version in versions]

    # Filter for specific major versions
    filtered_versions = [version for version in version_list
                         if any(version.startswith(str(major) + '.') for major in major_versions)]

    return filtered_versions

def main():
    parser = argparse.ArgumentParser(description='Fetch Node.js versions for specific major versions.')
    parser.add_argument('major_versions', nargs='+', type=int,
                        help='List of major versions to fetch, separated by spaces')

    args = parser.parse_args()

    # Get Node.js versions
    nodejs_versions = get_nodejs_versions(args.major_versions)
    print(nodejs_versions)

if __name__ == "__main__":
    main()
