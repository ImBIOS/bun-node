#!/bin/bash
set -e

# Handle Ctrl+C
trap 'kill $nextBuildPid $copyPublicPid $copyStaticPid 2>/dev/null' INT

# Run Next.js build with passed arguments
next build "$@" &
nextBuildPid=$!
wait $nextBuildPid

# Copy files only if not in a CI environment
if [ -z "$CI" ]; then
  cp -r ./public ./.next/standalone/public &
  copyPublicPid=$!

  cp -r ./.next/static ./.next/standalone/.next/static &
  copyStaticPid=$!

  wait $copyPublicPid $copyStaticPid
fi
