#!/bin/bash

REPO=$1
FILE=$2

curl -s https://api.github.com/repos/$REPO/releases/latest | jq -r '.tag_name' >latest_$FILE.txt || exit 1

if [[ -f last_$FILE.txt && $(cat last_$FILE.txt) != $(cat latest_$FILE.txt) ]]; then
  echo "New version found for $FILE."
  cat latest_$FILE.txt >last_$FILE.txt
  echo "$FILE-is-out-of-date=true" >>"$GITHUB_ENV"
  echo "$FILE-version=true" >>"$GITHUB_ENV"
else
  echo "No new version found for $FILE."
  echo "$FILE-is-out-of-date=false" >>"$GITHUB_ENV"
fi
