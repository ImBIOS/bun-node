#!/bin/bash

# Check if the directory exists
if [ ! -d "$1" ]; then
  echo "Directory $1 does not exist. Please provide a valid directory."
  exit 1
fi

# Find lcov.info and coverage.lcov files
LCOV_INPUT_FILES=$(find . \( -name "lcov.info" -o -name "coverage.lcov" \))

# Check if any files were found
if [ -z "$LCOV_INPUT_FILES" ]; then
  echo "No lcov.info or coverage.lcov files found in current directory recursively."
  exit 1
fi

# Initialize the lcov command
LCOV_COMMAND="lcov"

# Loop over each found file and append to the lcov command
for FILE in $LCOV_INPUT_FILES; do
  LCOV_COMMAND="$LCOV_COMMAND -a \"$FILE\""
done

# Run the lcov command with the specified output path
$LCOV_COMMAND -o "$1/$2"
