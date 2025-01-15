import json
from unittest.mock import MagicMock, mock_open, patch

import pytest
import responses
from bs4 import BeautifulSoup

from check_nodejs import get_nodejs_versions, main


def mock_previous_releases_html():
    return """
    <table>
        <tr>
            <td data-label="Version">Node.js v16.20.0</td>
        </tr>
        <tr>
            <td data-label="Version">Node.js v14.21.3</td>
        </tr>
        <tr>
            <td data-label="Version">Node.js v12.22.12</td>
        </tr>
        <tr>
            <td data-label="Version">Node.js v10.24.1</td>
        </tr>
    </table>
    """


def test_get_nodejs_versions():
    """Test fetching Node.js versions with valid major versions."""
    with patch("check_nodejs.requests.get") as mock_get:
        mock_get.return_value.content = mock_previous_releases_html()

        result = get_nodejs_versions([16, 14])
        expected = ["v16.20.0", "v14.21.3"]

        assert result == expected


def test_get_nodejs_versions_no_match():
    """Test fetching Node.js versions with no matching major versions."""
    with patch("check_nodejs.requests.get") as mock_get:
        mock_get.return_value.content = mock_previous_releases_html()

        result = get_nodejs_versions([8])
        expected = []

        assert result == expected


def test_get_nodejs_versions_empty_page():
    """Test fetching Node.js versions when the HTML page is empty."""
    with patch("check_nodejs.requests.get") as mock_get:
        mock_get.return_value.content = "<html></html>"

        result = get_nodejs_versions([16])
        expected = []

        assert result == expected


def test_main(monkeypatch):
    """Test the main function including JSON handling and updates."""
    test_args = ["check_nodejs.py", "16,14"]
    monkeypatch.setattr("sys.argv", test_args)

    # Mock open to simulate versions.json content
    mock_json = json.dumps(
        {
            "nodejs": {
                "16": {"version": "v16.19.0"},
                "14": {"version": "v14.20.0"},
            }
        }
    )

    with patch("builtins.open", mock_open(read_data=mock_json)) as mock_file:
        with patch("check_nodejs.requests.get") as mock_get:
            mock_get.return_value.content = mock_previous_releases_html()

            with patch("builtins.print") as mock_print:
                main()

                # Check that the print statement output matches the updated versions
                mock_print.assert_called_once_with("16.20.0,14.21.3")

                # Ensure the file was read
                mock_file.assert_called_once_with("versions.json", encoding="utf-8")


def test_main_no_updates(monkeypatch):
    """Test the main function when there are no updates to versions."""
    test_args = ["check_nodejs.py", "16,14"]
    monkeypatch.setattr("sys.argv", test_args)

    # Mock open to simulate versions.json content
    mock_json = json.dumps(
        {
            "nodejs": {
                "16": {"version": "v16.20.0"},
                "14": {"version": "v14.21.3"},
            }
        }
    )

    with patch("builtins.open", mock_open(read_data=mock_json)) as mock_file:
        with patch("check_nodejs.requests.get") as mock_get:
            mock_get.return_value.content = mock_previous_releases_html()

            with patch("builtins.print") as mock_print:
                main()

                # Ensure nothing was printed (no updates)
                mock_print.assert_not_called()

                # Ensure the file was read
                mock_file.assert_called_once_with("versions.json", encoding="utf-8")


@pytest.mark.skip
def test_main_missing_major_version(monkeypatch):
    """Test the main function with a missing major version in the JSON file."""
    test_args = ["check_nodejs.py", "12"]
    monkeypatch.setattr("sys.argv", test_args)

    # Mock open to simulate versions.json content
    mock_json = json.dumps(
        {
            "nodejs": {
                "16": {"version": "v16.19.0"},
            }
        }
    )

    with patch("builtins.open", mock_open(read_data=mock_json)) as mock_file:
        with patch("check_nodejs.requests.get") as mock_get:
            mock_get.return_value.content = mock_previous_releases_html()

            with patch("builtins.print") as mock_print:  # Patch print instead of stderr
                main()

                # Ensure error message for missing major version is printed
                mock_print.assert_any_call(
                    "Error: Major version 12 not found in current versions."
                )
