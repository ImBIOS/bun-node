import json
from unittest.mock import mock_open, patch

import pytest
from bs4 import BeautifulSoup
from packaging import version

from check_bun import (
    get_bun_latest_versions,
    main,
    parse_version,
    update_latest_versions,
)


@pytest.fixture
def mock_html():
    """Mock HTML content for the Bun NPM page."""
    return """
    <a class="_132722c7 f5 black-60 lh-copy code">1.0.0</a>
    <a class="_132722c7 f5 black-60 lh-copy code">1.1.0</a>
    <a class="_132722c7 f5 black-60 lh-copy code">1.1.1-canary</a>
    """


@pytest.fixture
def mock_versions_json():
    """Mock content for the versions.json file."""
    return json.dumps({"bun": {"latest": "1.0.0", "canary": "1.1.0-canary"}})


@patch("check_bun.requests.get")
@patch("check_bun.BeautifulSoup")
def test_get_bun_latest_versions(mock_bs, mock_requests, mock_html):
    """Test fetching latest Bun versions."""
    mock_requests.return_value.content = mock_html
    mock_requests.return_value.raise_for_status = lambda: None
    mock_bs.return_value.find_all.return_value = [
        BeautifulSoup(mock_html, "html.parser").find_all("a")[0],
        BeautifulSoup(mock_html, "html.parser").find_all("a")[1],
        BeautifulSoup(mock_html, "html.parser").find_all("a")[2],
    ]
    result = get_bun_latest_versions(["latest", "canary"])
    assert result["latest"] == "1.1.0"
    assert result["canary"] == "1.1.1-canary"


def test_parse_version():
    """Test parsing version strings."""
    parsed_version, is_canary = parse_version("1.1.1-canary")
    assert parsed_version.public == "1.1.1"
    assert is_canary

    parsed_version, is_canary = parse_version("1.1.0")
    assert parsed_version.public == "1.1.0"
    assert not is_canary


def test_update_latest_versions():
    """Test updating the latest version dictionary."""
    latest_versions = {"latest": None, "canary": None}
    update_latest_versions(
        latest_versions, "1.1.1", version.parse("1.1.1"), False, ["latest", "canary"]
    )
    assert latest_versions["latest"] == "1.1.1"

    update_latest_versions(
        latest_versions,
        "1.1.1-canary",
        version.parse("1.1.1"),
        True,
        ["latest", "canary"],
    )
    assert latest_versions["canary"] == "1.1.1-canary"

    # Ensure no updates if the version is older
    update_latest_versions(
        latest_versions, "1.0.0", version.parse("1.0.0"), False, ["latest", "canary"]
    )
    assert latest_versions["latest"] == "1.1.1"


@patch(
    "builtins.open",
    new_callable=mock_open,
    read_data='{"bun": {"latest": "1.0.0", "canary": "1.1.0-canary"}}',
)
@patch("check_bun.get_bun_latest_versions")
def test_main(mock_get_bun_latest_versions, mock_file):
    """Test the main function."""
    mock_get_bun_latest_versions.return_value = {
        "latest": "1.1.0",
        "canary": "1.1.1-canary",
    }
    with patch("sys.argv", ["check_bun.py", "latest,canary"]), patch(
        "builtins.print"
    ) as mock_print:
        main()
        mock_print.assert_called_once_with("1.1.0,1.1.1-canary")
